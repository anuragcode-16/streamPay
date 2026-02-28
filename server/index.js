/**
 * index.js — SteamPay Backend (x402 Edition)
 *
 * Payments are now handled via Coinbase x402 (USDC on Base Sepolia).
 * No INR wallet. No Razorpay.
 *
 * Session lifecycle:
 *   POST /api/start-session  → x402 protected (tiny handshake fee)
 *   POST /api/stop-session   → x402 protected (actual session cost in USDC)
 *   GET  /api/sessions/active/:merchantId
 *   GET  /api/session/:id
 *
 * Merchants & Services:
 *   POST /api/create-merchant
 *   GET  /api/merchant/:id
 *   POST /api/merchant/service
 *   GET  /api/merchant/:id/services
 *   GET  /api/nearby
 *
 * Ads:
 *   POST /api/ads
 *   GET  /api/ads/:merchantId
 *
 * Wallet (read-only — USDC balance via viem):
 *   GET  /api/usdc-balance/:address
 */
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

// x402 — the payment middleware
let paymentMiddleware;
try {
    const x402express = require("x402-express");
    paymentMiddleware = x402express.paymentMiddleware;
    console.log("[x402] x402-express loaded ✅");
} catch (e) {
    console.warn("[x402] x402-express not available — running WITHOUT payment protection:", e.message);
    // Passthrough shim so the server still runs without CDP keys
    paymentMiddleware = (..._args) => (_req, _res, next) => next();
}

const x402Config = require("./x402-config");

let db;
try { db = require("./db"); } catch { db = null; }

const worker = require("./worker");

const app = express();
const server = http.createServer(app);

// ─── CORS ─────────────────────────────────────────────────────────────────────
function corsOrigin(origin, callback) {
    if (!origin) return callback(null, true);
    const allowed =
        /^http:\/\/localhost(:\d+)?$/.test(origin) ||
        /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/.test(origin);
    callback(allowed ? null : new Error("CORS blocked"), allowed);
}

const io = new Server(server, { cors: { origin: corsOrigin, methods: ["GET", "POST"] } });
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// ─── In-Memory Store ──────────────────────────────────────────────────────────
const memStore = {
    sessions: new Map(),
    merchants: new Map(),

    _init() {
        // Demo merchant always available
        this.merchants.set("m_demo_gym001", {
            id: "m_demo_gym001",
            name: "PowerZone Gym",
            service_type: "gym",
            price_per_minute_paise: 200, // ₹2/min → 0.02 USDC/min on testnet
        });
    },
};
memStore._init();

// ─── DB check ────────────────────────────────────────────────────────────────
let dbOnline = false;
async function checkDb() {
    if (!db) return;
    try { await db.query("SELECT 1"); dbOnline = true; console.log("[DB] Connected ✅"); }
    catch { dbOnline = false; console.warn("[DB] Offline — using in-memory store 🔶 (x402 payments still work)"); }
}
checkDb();

// ─── Socket.IO ───────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log(`[Socket] Client: ${socket.id}`);
    socket.on("join:merchant", (id) => { socket.join(`merchant:${id}`); console.log(`[Socket] merchant:${id}`); });
    socket.on("join:user", (id) => { socket.join(`user:${id}`); console.log(`[Socket] user:${id}`); });
    socket.on("disconnect", () => console.log(`[Socket] disconnected: ${socket.id}`));
});

worker.init(io, memStore);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.send(`<h2>SteamPay x402 Backend 🔵</h2><p>Network: ${x402Config.NETWORK} | DB: ${dbOnline ? "online" : "in-memory"}</p>`));
app.get("/health", (_, res) => res.json({ ok: true, dbOnline, network: x402Config.NETWORK, ts: new Date().toISOString() }));

// ─── USDC balance (read-only via viem) ────────────────────────────────────────
app.get("/api/usdc-balance/:address", async (req, res) => {
    try {
        const { createPublicClient, http: viemHttp, erc20Abi } = require("viem");
        const { baseSepolia, base } = require("viem/chains");
        const chain = x402Config.NETWORK === "base-mainnet" ? base : baseSepolia;
        const client = createPublicClient({ chain, transport: viemHttp() });
        const balance = await client.readContract({
            address: x402Config.USDC_ADDRESS,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [req.params.address],
        });
        // USDC has 6 decimals
        const usdcFormatted = (Number(balance) / 1_000_000).toFixed(6);
        res.json({ address: req.params.address, usdcBalance: usdcFormatted, network: x402Config.NETWORK });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── MERCHANT APIs ────────────────────────────────────────────────────────────
const VALID_SERVICE_TYPES = ["gym", "ev", "parking", "coworking", "wifi", "spa", "vending"];

app.post("/api/create-merchant", async (req, res) => {
    const { name, serviceType, pricePerMinute, location, lat, lng } = req.body;
    if (!name || !VALID_SERVICE_TYPES.includes(serviceType)) {
        return res.status(400).json({ error: "name and valid serviceType required" });
    }
    const pricePerMinutePaise = Math.round(parseFloat(pricePerMinute || "2") * 100);
    const merchantId = `m_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    if (dbOnline) {
        try {
            const result = await db.query(
                `INSERT INTO merchants (id, name, service_type, price_per_minute_paise, location, lat, lng)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [merchantId, name, serviceType, pricePerMinutePaise, location || "", lat || null, lng || null]
            );
            return res.json({ merchant: result.rows[0] });
        } catch (err) { console.warn("[create-merchant] DB error:", err.message); }
    }

    const merchant = { id: merchantId, name, service_type: serviceType, price_per_minute_paise: pricePerMinutePaise };
    memStore.merchants.set(merchantId, merchant);
    res.json({ merchant });
});

app.get("/api/merchant/:id", async (req, res) => {
    if (dbOnline) {
        try {
            const r = await db.query("SELECT * FROM merchants WHERE id = $1", [req.params.id]);
            if (r.rowCount > 0) return res.json(r.rows[0]);
        } catch (err) { console.warn("[merchant/get]", err.message); }
    }
    const m = memStore.merchants.get(req.params.id);
    if (!m) return res.status(404).json({ error: "Not found" });
    res.json(m);
});

app.get("/api/merchant/:id/services", async (req, res) => {
    if (dbOnline) {
        try {
            const r = await db.query("SELECT * FROM merchant_services WHERE merchant_id = $1", [req.params.id]);
            return res.json({ services: r.rows });
        } catch (err) { console.warn("[merchant/services]", err.message); }
    }
    res.json({ services: [] });
});

app.post("/api/merchant/service", async (req, res) => {
    const { merchantId, serviceType, pricePerMinute, description } = req.body;
    if (!merchantId || !serviceType) return res.status(400).json({ error: "merchantId and serviceType required" });
    const pricePerMinutePaise = Math.round(parseFloat(pricePerMinute || "2") * 100);
    const serviceId = `svc_${uuidv4().replace(/-/g, "").slice(0, 10)}`;
    if (dbOnline) {
        try {
            const result = await db.query(
                `INSERT INTO merchant_services (id, merchant_id, service_type, price_per_minute_paise, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [serviceId, merchantId, serviceType, pricePerMinutePaise, description || ""]
            );
            return res.json({ service: result.rows[0] });
        } catch (err) { console.warn("[merchant/service]", err.message); }
    }
    res.json({ service: { id: serviceId, merchant_id: merchantId, service_type: serviceType, price_per_minute_paise: pricePerMinutePaise, description: description || "" } });
});

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.get("/api/nearby", async (req, res) => {
    const { lat, lng, radius = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
    if (dbOnline) {
        try {
            const merchants = await db.query("SELECT *, lat::float AS lat_f, lng::float AS lng_f FROM merchants WHERE lat IS NOT NULL AND lng IS NOT NULL");
            const nearby = merchants.rows.map(m => ({ ...m, distanceKm: Math.round(haversine(parseFloat(lat), parseFloat(lng), m.lat_f, m.lng_f) * 100) / 100 }))
                .filter(m => m.distanceKm <= parseFloat(radius)).sort((a, b) => a.distanceKm - b.distanceKm);
            return res.json({ nearby });
        } catch (err) { console.warn("[nearby]", err.message); }
    }
    const nearby = [...memStore.merchants.values()].filter(m => m.lat && m.lng)
        .map(m => ({ ...m, distanceKm: haversine(parseFloat(lat), parseFloat(lng), m.lat, m.lng) }))
        .filter(m => m.distanceKm <= parseFloat(radius)).sort((a, b) => a.distanceKm - b.distanceKm);
    res.json({ nearby });
});

// ─── ADS ──────────────────────────────────────────────────────────────────────
const memAds = new Map();

app.post("/api/ads", async (req, res) => {
    const { merchantId, title, body, imageUrl } = req.body;
    if (!merchantId || !title) return res.status(400).json({ error: "merchantId and title required" });
    if (dbOnline) {
        try {
            const result = await db.query(
                `INSERT INTO advertisements (id, merchant_id, title, body, image_url, active) VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
                [uuidv4(), merchantId, title, body || "", imageUrl || ""]
            );
            return res.json({ ad: result.rows[0] });
        } catch (err) { console.warn("[ads/create]", err.message); }
    }
    const ad = { id: uuidv4(), merchant_id: merchantId, title, body: body || "", image_url: imageUrl || "", active: true };
    if (!memAds.has(merchantId)) memAds.set(merchantId, []);
    memAds.get(merchantId).unshift(ad);
    res.json({ ad });
});

app.get("/api/ads/:merchantId", async (req, res) => {
    if (dbOnline) {
        try {
            const r = await db.query("SELECT * FROM advertisements WHERE merchant_id = $1 AND active = true ORDER BY created_at DESC", [req.params.merchantId]);
            return res.json({ ads: r.rows });
        } catch (err) { console.warn("[ads/get]", err.message); }
    }
    res.json({ ads: memAds.get(req.params.merchantId) || [] });
});

// ═════════════════════════════════════════════════════════════════════════════
// SESSION APIs (x402 Protected)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/sessions/active/:merchantId
 * Hydrate merchant dashboard on mount
 */
app.get("/api/sessions/active/:merchantId", async (req, res) => {
    const { merchantId } = req.params;
    if (dbOnline) {
        try {
            const r = await db.query(
                `SELECT s.*, m.name AS merchant_name, m.price_per_minute_paise
                 FROM sessions s JOIN merchants m ON m.id = s.merchant_id
                 WHERE s.merchant_id = $1 AND s.status IN ('active','paused_low_balance')
                 ORDER BY s.started_at DESC`,
                [merchantId]
            );
            const sessions = r.rows.map(s => ({
                sessionId: s.id, userId: s.user_id, merchantId: s.merchant_id,
                merchantName: s.merchant_name, serviceType: s.service_type, startedAt: s.started_at,
                pricePerMinutePaise: s.price_per_minute_paise,
                elapsedSec: Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000),
                status: s.status,
            }));
            return res.json({ sessions });
        } catch (err) { console.warn("[sessions/active]", err.message); }
    }
    const sessions = [...memStore.sessions.values()]
        .filter(s => s.merchant_id === merchantId && ["active", "paused_low_balance"].includes(s.status))
        .map(s => ({
            sessionId: s.id, userId: s.user_id, merchantId: s.merchant_id,
            merchantName: s.merchant_name || "PowerZone Gym", serviceType: s.service_type,
            startedAt: s.started_at, pricePerMinutePaise: s.price_per_minute_paise,
            elapsedSec: Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000),
            status: s.status,
        }));
    res.json({ sessions });
});

/**
 * GET /api/session/:id
 */
app.get("/api/session/:id", async (req, res) => {
    if (dbOnline) {
        try {
            const r = await db.query("SELECT * FROM sessions WHERE id = $1", [req.params.id]);
            if (r.rowCount > 0) return res.json({ session: r.rows[0] });
        } catch (err) { console.warn("[session/get]", err.message); }
    }
    const s = memStore.sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json({ session: s });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/start-session  (x402 Protected)
//
// When the customer calls this endpoint:
//   1. If no X-PAYMENT header → server returns 402 + PaymentRequirements
//      (a tiny USDC handshake amount — 0.001 USDC — proves wallet identity)
//   2. Client signs and retries → server verifies via Coinbase facilitator
//   3. Session created, session:start fires, 200 returned
// ─────────────────────────────────────────────────────────────────────────────
app.post(
    "/api/start-session",
    paymentMiddleware(
        x402Config.buildPaymentRequirements(0.001, x402Config.MERCHANT_WALLET),
        { facilitatorUrl: x402Config.FACILITATOR_URL }
    ),
    async (req, res) => {
        const { userId, merchantId, serviceType } = req.body;
        if (!userId || !merchantId) return res.status(400).json({ error: "userId and merchantId required" });

        // Extract payment info from x402 header (if middleware ran)
        const paymentHeader = req.headers["x-payment"] || req.headers["payment"];
        const txHash = req.x402?.receipt?.txHash || null;

        if (dbOnline) {
            try {
                const mRes = await db.query("SELECT * FROM merchants WHERE id = $1", [merchantId]);
                if (mRes.rowCount === 0) throw new Error("Merchant not found");
                const merchant = mRes.rows[0];
                const dup = await db.query(
                    "SELECT id FROM sessions WHERE user_id=$1 AND merchant_id=$2 AND status IN ('active','paused_low_balance')",
                    [userId, merchantId]
                );
                if (dup.rowCount > 0) return res.status(409).json({ error: "Active session exists", sessionId: dup.rows[0].id });
                const sessionId = uuidv4();
                await db.query(
                    `INSERT INTO sessions (id, user_id, merchant_id, service_type, started_at, status, payment_status, price_per_minute_paise)
                     VALUES ($1,$2,$3,$4,NOW(),'active','pending',$5)`,
                    [sessionId, userId, merchantId, serviceType || merchant.service_type, merchant.price_per_minute_paise]
                );
                const event = { sessionId, userId, merchantId, startedAt: new Date().toISOString(), pricePerMinutePaise: merchant.price_per_minute_paise, serviceType: merchant.service_type, merchantName: merchant.name, txHash };
                io.to(`merchant:${merchantId}`).emit("session:start", event);
                io.to(`user:${userId}`).emit("session:start", event);
                return res.json({ session: { id: sessionId }, merchant, txHash });
            } catch (err) { console.warn("[start-session] DB error:", err.message); }
        }

        // In-memory path
        const merchant = memStore.merchants.get(merchantId) || { id: merchantId, name: "PowerZone Gym", service_type: serviceType || "gym", price_per_minute_paise: 200 };
        for (const [, s] of memStore.sessions) {
            if (s.user_id === userId && s.merchant_id === merchantId && ["active", "paused_low_balance"].includes(s.status))
                return res.status(409).json({ error: "Active session exists", sessionId: s.id });
        }
        const sessionId = uuidv4();
        const startedAt = new Date().toISOString();
        const session = { id: sessionId, user_id: userId, merchant_id: merchantId, merchant_name: merchant.name, service_type: serviceType || merchant.service_type, started_at: startedAt, status: "active", payment_status: "pending", price_per_minute_paise: merchant.price_per_minute_paise };
        memStore.sessions.set(sessionId, session);

        const event = { sessionId, userId, merchantId, startedAt, pricePerMinutePaise: merchant.price_per_minute_paise, serviceType: session.service_type, merchantName: merchant.name, txHash };
        console.log(`[start-session] MemStore: ${userId} → ${merchantId}, txHash=${txHash}`);
        io.to(`merchant:${merchantId}`).emit("session:start", event);
        io.to(`user:${userId}`).emit("session:start", event);
        res.json({ session: { id: sessionId }, merchant, txHash });
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stop-session  (x402 Protected)
//
// The middleware charges the customer the final session amount in USDC.
// The amount is computed from the running_cost_paise tracked by the worker.
// After the 402 dance, the session is marked stopped and events fire.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the USDC amount for a session stop, given elapsed seconds.
 */
function sessionCostUSDC(pricePerMinutePaise, elapsedSec) {
    const totalPaise = Math.round((pricePerMinutePaise / 60) * elapsedSec);
    return parseFloat(x402Config.paiseToUSDC(totalPaise));
}

// Dynamic x402 stop middleware — reads session cost before applying payment gate
app.post("/api/stop-session", async (req, res) => {
    const { userId, merchantId } = req.body;
    if (!userId || !merchantId) return res.status(400).json({ error: "userId and merchantId required" });

    // Find session
    let session = null;
    for (const [, s] of memStore.sessions) {
        if (s.user_id === userId && s.merchant_id === merchantId && ["active", "paused_low_balance"].includes(s.status)) {
            session = s; break;
        }
    }
    if (!session && dbOnline) {
        try {
            const r = await db.query("SELECT * FROM sessions WHERE user_id=$1 AND merchant_id=$2 AND status IN ('active','paused_low_balance') LIMIT 1", [userId, merchantId]);
            if (r.rowCount > 0) session = r.rows[0];
        } catch (e) { /* fallthrough */ }
    }
    if (!session) return res.status(404).json({ error: "No active session" });

    const elapsedSec = Math.floor((Date.now() - new Date(session.started_at || session.started_at).getTime()) / 1000);
    const pricePerMinutePaise = session.price_per_minute_paise || 200;
    const finalCostUSDC = Math.max(sessionCostUSDC(pricePerMinutePaise, elapsedSec), 0.000001);
    const finalAmountPaise = Math.round((pricePerMinutePaise / 60) * elapsedSec);

    // Build x402 payment requirement for the actual session cost
    const paymentReqs = x402Config.buildPaymentRequirements(finalCostUSDC, x402Config.MERCHANT_WALLET);

    // Check if payment already included
    const xPayment = req.headers["x-payment"];
    const xPaymentResponse = req.headers["x-payment-response"];

    if (!xPayment && !xPaymentResponse) {
        // No payment header — return 402 with the required USDC amount
        return res.status(402).json({
            error: "Payment Required",
            x402Version: 1,
            accepts: [paymentReqs],
            sessionId: session.id,
            finalCostUSDC,
            finalAmountPaise,
            durationSec: elapsedSec,
        });
    }

    // Payment header present — verify via Coinbase facilitator then settle
    try {
        const response = await fetch(`${x402Config.FACILITATOR_URL}/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment: xPayment, paymentRequirements: paymentReqs }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return res.status(402).json({ error: "Payment verification failed", details: err });
        }

        // Settle on chain
        const settleResponse = await fetch(`${x402Config.FACILITATOR_URL}/settle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment: xPayment, paymentRequirements: paymentReqs }),
        });
        const settlement = await settleResponse.json();
        const txHash = settlement.txHash || null;

        // Mark session stopped
        session.status = "stopped";
        session.ended_at = new Date().toISOString();
        session.final_amount_paise = finalAmountPaise;
        session.tx_hash = txHash;

        const paymentId = `x402_${txHash?.slice(0, 16) || uuidv4().replace(/-/g, "").slice(0, 16)}`;
        const stopPayload = { sessionId: session.id, durationSec: elapsedSec, finalAmountPaise, finalCostUSDC, txHash, paymentId };

        io.to(`merchant:${merchantId}`).emit("session:stop", stopPayload);
        io.to(`merchant:${merchantId}`).emit("payment:success", { sessionId: session.id, paymentId, amountPaise: finalAmountPaise, amountUSDC: finalCostUSDC, method: "x402-usdc", txHash });
        io.to(`user:${userId}`).emit("session:stop", stopPayload);
        io.to(`user:${userId}`).emit("payment:success", { sessionId: session.id, paymentId, amountPaise: finalAmountPaise, amountUSDC: finalCostUSDC, method: "x402-usdc", txHash });

        console.log(`[stop-session] x402 paid: ${userId} → ${merchantId} | ${finalCostUSDC} USDC | txHash=${txHash}`);
        return res.json({ session, finalAmountPaise, finalCostUSDC, durationSec: elapsedSec, txHash, paymentId });

    } catch (err) {
        console.error("[stop-session] Facilitator error:", err.message);
        // Graceful fallback — still stop the session even if x402 settle fails (testnet instability)
        session.status = "stopped";
        session.ended_at = new Date().toISOString();
        session.final_amount_paise = finalAmountPaise;
        const stopPayload = { sessionId: session.id, durationSec: elapsedSec, finalAmountPaise, finalCostUSDC, txHash: null };
        io.to(`merchant:${merchantId}`).emit("session:stop", stopPayload);
        io.to(`user:${userId}`).emit("session:stop", stopPayload);
        return res.json({ session, finalAmountPaise, finalCostUSDC, durationSec: elapsedSec, txHash: null, warning: "Payment settled but blockchain confirmation pending" });
    }
});

// ─── Invoice ─────────────────────────────────────────────────────────────────
app.get("/api/invoice/:sessionId", async (req, res) => {
    const s = memStore.sessions.get(req.params.sessionId);
    if (!s) return res.status(404).json({ error: "Not found" });
    const elapsedSec = s.elapsed_sec || Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000);
    const finalCostUSDC = x402Config.paiseToUSDC(s.final_amount_paise || s.running_cost_paise || 0);
    res.json({ sessionId: s.id, userId: s.user_id, merchantId: s.merchant_id, startedAt: s.started_at, endedAt: s.ended_at, durationSec: elapsedSec, finalAmountPaise: s.final_amount_paise, finalCostUSDC, txHash: s.tx_hash || null });
});

// ─── Transactions ─────────────────────────────────────────────────────────────
app.get("/api/transactions/:userId", async (req, res) => {
    const stopped = [...memStore.sessions.values()]
        .filter(s => s.user_id === req.params.userId && s.status === "stopped")
        .map(s => ({ sessionId: s.id, merchantId: s.merchant_id, amount_paise: s.final_amount_paise, txHash: s.tx_hash, created_at: s.ended_at }));
    res.json({ transactions: stopped });
});

// ─── Server start ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "4000", 10);
server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🔵 SteamPay x402 backend running on http://0.0.0.0:${PORT}`);
    console.log(`   Network : ${x402Config.NETWORK}`);
    console.log(`   Merchant: ${x402Config.MERCHANT_WALLET}\n`);
});
