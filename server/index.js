/**
 * index.js — Pulse Pay Express Server (FULL MVP)
 *
 * APIs:
 *  Session lifecycle:
 *    POST /api/start-session
 *    POST /api/stop-session          (returns final amount + payment options)
 *    POST /api/pay-wallet            (atomic wallet debit for final settlement)
 *    POST /api/create-order          (Razorpay order for session or topup)
 *    GET  /api/session/:id
 *
 *  Merchants & Services:
 *    POST /api/create-merchant
 *    GET  /api/merchant/:id
 *    POST /api/merchant/service      (add service to merchant)
 *    GET  /api/merchant/:id/services
 *    GET  /api/nearby?lat=&lng=&r=   (OSM + DB nearby)
 *
 *  Wallet:
 *    POST /api/wallet/create
 *    GET  /api/wallet/:userId
 *    POST /api/wallet/topup          (create Razorpay order for topup)
 *    GET  /api/wallet/transactions/:userId
 *
 *  Ads:
 *    POST /api/ads
 *    GET  /api/ads/:merchantId
 *
 *  Transactions & Invoice:
 *    GET  /api/transactions/:userId
 *    GET  /api/invoice/:sessionId
 *
 *  Webhook:
 *    POST /api/webhook/razorpay      (HMAC verified, handles session payments + topups)
 */
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const https = require("https");

const db = require("./db");
const worker = require("./worker");
const { createOrder, verifyWebhookSignature } = require("./razorpay");

const app = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

const io = new Server(server, {
    cors: { origin: FRONTEND_URL, methods: ["GET", "POST"] },
});

app.use(cors({ origin: FRONTEND_URL }));
// Raw body for webhook HMAC
app.use("/api/webhook/razorpay", express.raw({ type: "application/json" }));
app.use((req, res, next) => {
    if (req.path === "/api/webhook/razorpay") return next();
    express.json()(req, res, next);
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    socket.on("join:merchant", (id) => socket.join(`merchant:${id}`));
    socket.on("join:user", (id) => socket.join(`user:${id}`));
});

worker.init(io);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function decodeQRPayload(raw) {
    try { return JSON.parse(raw); } catch { }
    try { return JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch { }
    return null;
}

/** Generate a wallet ID in PPW-XXXXXXXX format */
function generateWalletId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "PPW-";
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

// Haversine distance (km) between two lat/lng points
function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Health & Root ─────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.send(`<h2>Pulse Pay Backend is running! 🚀</h2><p>API endpoints are active.</p>`));
app.get("/health", (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ═════════════════════════════════════════════════════════════════════════════
// WALLET APIs
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/wallet/create
app.post("/api/wallet/create", async (req, res) => {
    const { userId, displayName } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
        // Check if wallet already exists
        const existing = await db.query("SELECT * FROM wallets WHERE user_id = $1", [userId]);
        if (existing.rowCount > 0) return res.json({ wallet: existing.rows[0] });

        const walletId = generateWalletId();
        const name = displayName || `Wallet-${userId.slice(0, 6)}`;
        const result = await db.query(
            `INSERT INTO wallets (wallet_id, user_id, display_name, balance_paise)
       VALUES ($1, $2, $3, 0) RETURNING *`,
            [walletId, userId, name]
        );
        res.json({ wallet: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/wallet/:userId
app.get("/api/wallet/:userId", async (req, res) => {
    try {
        const result = await db.query(
            "SELECT * FROM wallets WHERE user_id = $1",
            [req.params.userId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: "No wallet found" });
        res.json({ wallet: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/wallet/topup — create Razorpay order for wallet top-up
app.post("/api/wallet/topup", async (req, res) => {
    const { userId, amountINR } = req.body;
    if (!userId || !amountINR || amountINR <= 0) {
        return res.status(400).json({ error: "userId and amountINR (positive) required" });
    }

    const amountPaise = Math.round(parseFloat(amountINR) * 100);
    if (amountPaise < 100) return res.status(400).json({ error: "Minimum top-up is ₹1" });

    try {
        const walletRes = await db.query("SELECT * FROM wallets WHERE user_id = $1", [userId]);
        if (walletRes.rowCount === 0) return res.status(404).json({ error: "Wallet not found. Create one first." });
        const wallet = walletRes.rows[0];

        const topupId = uuidv4();
        // Create order with receipt referencing topup
        const order = await createOrder(amountPaise, `topup_${topupId}`);

        // Record pending wallet transaction
        await db.query(
            `INSERT INTO wallet_transactions
         (id, wallet_id, user_id, type, amount_paise, status, razorpay_order_id, created_at)
       VALUES ($1, $2, $3, 'topup', $4, 'pending', $5, NOW())`,
            [topupId, wallet.wallet_id, userId, amountPaise, order.id]
        );

        res.json({ order, amountPaise, walletId: wallet.wallet_id });
    } catch (err) {
        console.error("[wallet/topup]", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/wallet/transactions/:userId
app.get("/api/wallet/transactions/:userId", async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
            [req.params.userId]
        );
        res.json({ transactions: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/pay-wallet — pay session final amount from wallet
app.post("/api/pay-wallet", async (req, res) => {
    const { userId, sessionId } = req.body;
    if (!userId || !sessionId) return res.status(400).json({ error: "userId and sessionId required" });

    const client = await db.getClient();
    try {
        await client.query("BEGIN");

        const sesRes = await client.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
        if (sesRes.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Session not found" }); }
        const session = sesRes.rows[0];

        if (session.payment_status === "paid") { await client.query("ROLLBACK"); return res.status(409).json({ error: "Already paid" }); }

        const finalAmountPaise = session.final_amount_paise || 0;
        if (finalAmountPaise <= 0) { await client.query("ROLLBACK"); return res.status(400).json({ error: "No amount to charge" }); }

        // Atomic wallet debit
        const walletRes = await client.query(
            `UPDATE wallets SET balance_paise = balance_paise - $1 WHERE user_id = $2 AND balance_paise >= $1 RETURNING *`,
            [finalAmountPaise, userId]
        );
        if (walletRes.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(402).json({ error: "Insufficient wallet balance" });
        }

        const paymentId = `ppw_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

        // Record payment
        await client.query(
            `INSERT INTO payments (id, user_id, merchant_id, session_id, order_id, payment_id, amount_paise, status, method)
       VALUES ($1, $2, $3, $4, 'wallet', $5, $6, 'paid', 'wallet')`,
            [uuidv4(), userId, session.merchant_id, sessionId, paymentId, finalAmountPaise]
        );

        // Mark session paid
        await client.query("UPDATE sessions SET payment_status = 'paid' WHERE id = $1", [sessionId]);

        // Credit merchant payable
        await client.query(
            `INSERT INTO merchant_payable (merchant_id, session_id, amount_paise, payment_id, credited_at)
       VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (payment_id) DO NOTHING`,
            [session.merchant_id, sessionId, finalAmountPaise, paymentId]
        );

        // Wallet transaction record
        await client.query(
            `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_paise, status, session_id, created_at)
       SELECT $1, wallet_id, $2, 'payment', $3, 'completed', $4, NOW() FROM wallets WHERE user_id = $2`,
            [uuidv4(), userId, finalAmountPaise, sessionId]
        );

        await client.query("COMMIT");

        // Emit events after commit
        const successPayload = { sessionId, paymentId, amountPaise: finalAmountPaise, method: "wallet" };
        io.to(`merchant:${session.merchant_id}`).emit("payment:success", successPayload);
        io.to(`user:${userId}`).emit("payment:success", successPayload);
        io.to(`user:${userId}`).emit("wallet:update", { balancePaise: walletRes.rows[0].balance_paise });

        res.json({ ok: true, paymentId, newBalancePaise: walletRes.rows[0].balance_paise });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("[pay-wallet]", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// MERCHANT APIS
// ═════════════════════════════════════════════════════════════════════════════

const VALID_SERVICE_TYPES = ["gym", "ev", "parking", "coworking", "wifi", "spa", "vending"];

// POST /api/create-merchant
app.post("/api/create-merchant", async (req, res) => {
    const { name, serviceType, pricePerMinute, location, lat, lng, userId } = req.body;
    if (!name || !VALID_SERVICE_TYPES.includes(serviceType)) {
        return res.status(400).json({ error: "name and valid serviceType required" });
    }
    const pricePerMinutePaise = Math.round(parseFloat(pricePerMinute || "2") * 100);
    const merchantId = `m_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    try {
        const result = await db.query(
            `INSERT INTO merchants (id, name, service_type, price_per_minute_paise, location, lat, lng, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [merchantId, name, serviceType, pricePerMinutePaise, location || "", lat || null, lng || null, userId || null]
        );

        const startQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "start" })).toString("base64");
        const stopQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "stop" })).toString("base64");

        res.json({ merchant: result.rows[0], qr: { start: startQR, stop: stopQR } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/merchant/:id
app.get("/api/merchant/:id", async (req, res) => {
    try {
        const r = await db.query("SELECT * FROM merchants WHERE id = $1", [req.params.id]);
        if (r.rowCount === 0) return res.status(404).json({ error: "Not found" });
        res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/merchant/service — add service to a merchant
app.post("/api/merchant/service", async (req, res) => {
    const { merchantId, serviceType, pricePerMinute, description } = req.body;
    if (!merchantId || !serviceType) return res.status(400).json({ error: "merchantId and serviceType required" });

    const pricePerMinutePaise = Math.round(parseFloat(pricePerMinute || "2") * 100);
    const serviceId = `svc_${uuidv4().replace(/-/g, "").slice(0, 10)}`;

    try {
        const result = await db.query(
            `INSERT INTO merchant_services (id, merchant_id, service_type, price_per_minute_paise, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [serviceId, merchantId, serviceType, pricePerMinutePaise, description || ""]
        );

        // Generate QR for this specific service
        const startQR = Buffer.from(JSON.stringify({ merchantId, merchantServiceId: serviceId, serviceType, action: "start" })).toString("base64");
        const stopQR = Buffer.from(JSON.stringify({ merchantId, merchantServiceId: serviceId, serviceType, action: "stop" })).toString("base64");

        res.json({ service: result.rows[0], qr: { start: startQR, stop: stopQR } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/merchant/:id/services
app.get("/api/merchant/:id/services", async (req, res) => {
    try {
        const r = await db.query(
            "SELECT * FROM merchant_services WHERE merchant_id = $1 ORDER BY created_at",
            [req.params.id]
        );
        res.json({ services: r.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/nearby?lat=&lng=&radius=5
app.get("/api/nearby", async (req, res) => {
    const { lat, lng, radius = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });

    try {
        // Query merchants from DB sorted by Haversine distance
        const merchants = await db.query(
            "SELECT *, lat::float AS lat_f, lng::float AS lng_f FROM merchants WHERE lat IS NOT NULL AND lng IS NOT NULL"
        );

        const nearby = merchants.rows
            .map((m) => {
                const dist = haversine(parseFloat(lat), parseFloat(lng), m.lat_f, m.lng_f);
                return { ...m, distanceKm: Math.round(dist * 100) / 100 };
            })
            .filter((m) => m.distanceKm <= parseFloat(radius))
            .sort((a, b) => a.distanceKm - b.distanceKm);

        res.json({ nearby });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADVERTISEMENT APIs
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/ads
app.post("/api/ads", async (req, res) => {
    const { merchantId, title, body, imageUrl } = req.body;
    if (!merchantId || !title) return res.status(400).json({ error: "merchantId and title required" });
    try {
        const result = await db.query(
            `INSERT INTO advertisements (id, merchant_id, title, body, image_url, active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
            [uuidv4(), merchantId, title, body || "", imageUrl || ""]
        );
        res.json({ ad: result.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ads/:merchantId
app.get("/api/ads/:merchantId", async (req, res) => {
    try {
        const r = await db.query(
            "SELECT * FROM advertisements WHERE merchant_id = $1 AND active = true ORDER BY created_at DESC",
            [req.params.merchantId]
        );
        res.json({ ads: r.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// SESSION APIs
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/start-session
app.post("/api/start-session", async (req, res) => {
    let { userId, merchantId, merchantServiceId, serviceType, payload } = req.body;

    if (payload) {
        const d = decodeQRPayload(payload);
        if (!d || d.action !== "start") return res.status(400).json({ error: "Invalid start payload" });
        merchantId = d.merchantId; serviceType = d.serviceType; merchantServiceId = d.merchantServiceId;
    }
    if (!userId || !merchantId) return res.status(400).json({ error: "userId and merchantId required" });

    try {
        const mRes = await db.query("SELECT * FROM merchants WHERE id = $1", [merchantId]);
        if (mRes.rowCount === 0) return res.status(404).json({ error: "Merchant not found" });
        const merchant = mRes.rows[0];

        // Use service price if serviceId provided
        let pricePerMinutePaise = merchant.price_per_minute_paise;
        if (merchantServiceId) {
            const svcRes = await db.query("SELECT * FROM merchant_services WHERE id = $1", [merchantServiceId]);
            if (svcRes.rowCount > 0) pricePerMinutePaise = svcRes.rows[0].price_per_minute_paise;
        }

        // Duplicate active session check
        const dup = await db.query(
            "SELECT id FROM sessions WHERE user_id = $1 AND merchant_id = $2 AND status IN ('active','paused_low_balance')",
            [userId, merchantId]
        );
        if (dup.rowCount > 0) return res.status(409).json({ error: "Active session exists", sessionId: dup.rows[0].id });

        // Create session
        const sessionId = uuidv4();
        const sesRes = await db.query(
            `INSERT INTO sessions (id, user_id, merchant_id, merchant_service_id, service_type, started_at, status, payment_status, price_per_minute_paise)
       VALUES ($1,$2,$3,$4,$5,NOW(),'active','pending',$6) RETURNING *`,
            [sessionId, userId, merchantId, merchantServiceId || null, serviceType || merchant.service_type, pricePerMinutePaise]
        );
        const session = sesRes.rows[0];

        const eventData = {
            sessionId, userId, merchantId, startedAt: session.started_at,
            pricePerMinutePaise, serviceType: session.service_type, merchantName: merchant.name
        };
        io.to(`merchant:${merchantId}`).emit("session:start", eventData);
        io.to(`user:${userId}`).emit("session:start", eventData);

        // Fetch active ads for the merchant
        const adsRes = await db.query("SELECT * FROM advertisements WHERE merchant_id = $1 AND active = true LIMIT 3", [merchantId]);

        res.json({ session, merchant, ads: adsRes.rows });
    } catch (err) {
        console.error("[start-session]", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/stop-session
app.post("/api/stop-session", async (req, res) => {
    let { userId, merchantId, payload } = req.body;
    if (payload) {
        const d = decodeQRPayload(payload);
        if (!d || d.action !== "stop") return res.status(400).json({ error: "Invalid stop payload" });
        merchantId = d.merchantId;
    }
    if (!userId || !merchantId) return res.status(400).json({ error: "userId and merchantId required" });

    try {
        const sesRes = await db.query(
            "SELECT * FROM sessions WHERE user_id=$1 AND merchant_id=$2 AND status IN ('active','paused_low_balance') ORDER BY started_at DESC LIMIT 1",
            [userId, merchantId]
        );
        if (sesRes.rowCount === 0) return res.status(404).json({ error: "No active session" });
        const session = sesRes.rows[0];

        // Authoritative final amount from ledger
        const ledRes = await db.query(
            "SELECT COALESCE(SUM(amount_paise),0)::int AS total FROM ledger WHERE session_id=$1",
            [session.id]
        );
        const finalAmountPaise = ledRes.rows[0].total;

        const durRes = await db.query(
            "SELECT EXTRACT(EPOCH FROM (NOW()-started_at))::int AS d FROM sessions WHERE id=$1",
            [session.id]
        );
        const durationSec = durRes.rows[0]?.d || 0;

        await db.query(
            "UPDATE sessions SET status='stopped', ended_at=NOW(), final_amount_paise=$1 WHERE id=$2",
            [finalAmountPaise, session.id]
        );

        // Check wallet balance for settlement option
        const walletRes = await db.query("SELECT balance_paise FROM wallets WHERE user_id=$1", [userId]);
        const walletBalance = walletRes.rows[0]?.balance_paise || 0;
        const canPayWallet = walletBalance >= finalAmountPaise;

        const stopPayload = { sessionId: session.id, durationSec, finalAmountPaise };
        io.to(`merchant:${merchantId}`).emit("session:stop", stopPayload);
        io.to(`user:${userId}`).emit("session:stop", stopPayload);

        res.json({
            session: { ...session, status: "stopped", final_amount_paise: finalAmountPaise, duration_sec: durationSec },
            finalAmountPaise, durationSec, walletBalance, canPayWallet,
        });
    } catch (err) {
        console.error("[stop-session]", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/create-order  (for Razorpay session payment)
app.post("/api/create-order", async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    try {
        const sesRes = await db.query("SELECT * FROM sessions WHERE id=$1", [sessionId]);
        if (sesRes.rowCount === 0) return res.status(404).json({ error: "Session not found" });
        const session = sesRes.rows[0];
        const amountPaise = Math.max(session.final_amount_paise || 100, 100);
        const order = await createOrder(amountPaise, sessionId);
        await db.query("UPDATE sessions SET razorpay_order_id=$1 WHERE id=$2", [order.id, sessionId]);
        res.json({ order, amountPaise });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/session/:id
app.get("/api/session/:id", async (req, res) => {
    try {
        const s = await db.query(
            "SELECT s.*, m.name AS merchant_name, m.service_type, m.price_per_minute_paise FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.id=$1",
            [req.params.id]
        );
        if (s.rowCount === 0) return res.status(404).json({ error: "Not found" });
        const l = await db.query("SELECT * FROM ledger WHERE session_id=$1 ORDER BY ts DESC LIMIT 200", [req.params.id]);
        res.json({ session: s.rows[0], ledger: l.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/transactions/:userId
app.get("/api/transactions/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const sessions = await db.query(
            "SELECT s.*, m.name AS merchant_name, m.service_type FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.user_id=$1 ORDER BY s.started_at DESC LIMIT 50",
            [userId]
        );
        const payments = await db.query(
            "SELECT p.*, m.name AS merchant_name FROM payments p JOIN merchants m ON m.id=p.merchant_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 50",
            [userId]
        );
        const ledger = await db.query(
            "SELECT * FROM ledger WHERE user_id=$1 ORDER BY ts DESC LIMIT 100",
            [userId]
        );
        res.json({ sessions: sessions.rows, payments: payments.rows, ledger: ledger.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/invoice/:sessionId — structured invoice for download
app.get("/api/invoice/:sessionId", async (req, res) => {
    try {
        const s = await db.query(
            "SELECT s.*, m.name AS merchant_name, m.service_type, m.location FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.id=$1",
            [req.params.sessionId]
        );
        if (s.rowCount === 0) return res.status(404).json({ error: "Not found" });
        const session = s.rows[0];
        const l = await db.query("SELECT * FROM ledger WHERE session_id=$1 ORDER BY ts", [req.params.sessionId]);
        const p = await db.query("SELECT * FROM payments WHERE session_id=$1", [req.params.sessionId]);

        const invoice = {
            invoiceId: `INV-${req.params.sessionId.slice(0, 8).toUpperCase()}`,
            generatedAt: new Date().toISOString(),
            merchant: { name: session.merchant_name, serviceType: session.service_type, location: session.location },
            session: {
                id: session.id, startedAt: session.started_at, endedAt: session.ended_at,
                durationSec: session.ended_at ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 1000) : null,
                finalAmountPaise: session.final_amount_paise,
                finalAmountINR: (session.final_amount_paise / 100).toFixed(2),
                status: session.status, paymentStatus: session.payment_status,
            },
            ledgerSummary: { totalTicks: l.rows.length, totalDebitedPaise: l.rows.reduce((s, r) => s + r.amount_paise, 0) },
            payment: p.rows[0] || null,
        };

        res.setHeader("Content-Disposition", `attachment; filename="invoice_${invoice.invoiceId}.json"`);
        res.json(invoice);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// WEBHOOK — handles both session payments AND wallet topups
// ═════════════════════════════════════════════════════════════════════════════
app.post("/api/webhook/razorpay", async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) return res.status(400).json({ error: "Missing signature" });

    const rawBody = req.body;
    if (!verifyWebhookSignature(rawBody, signature)) {
        console.warn("[Webhook] Invalid signature");
        return res.status(400).json({ error: "Invalid signature" });
    }

    let event;
    try { event = JSON.parse(rawBody.toString("utf8")); } catch { return res.status(400).json({ error: "Bad JSON" }); }
    console.log(`[Webhook] ${event.event}`);

    if (event.event === "payment.captured") {
        const payment = event.payload.payment.entity;
        const { order_id: orderId, id: paymentId, amount: amountPaise } = payment;

        try {
            // Idempotency check
            const dup = await db.query("SELECT id FROM payments WHERE payment_id=$1", [paymentId]);
            if (dup.rowCount > 0) return res.json({ ok: true });

            // ── Check if this is a WALLET TOPUP ───────────────────────────────────
            const txRes = await db.query(
                "SELECT * FROM wallet_transactions WHERE razorpay_order_id=$1 AND type='topup'",
                [orderId]
            );

            if (txRes.rowCount > 0) {
                const tx = txRes.rows[0];
                // Credit wallet
                await db.query(
                    "UPDATE wallets SET balance_paise = balance_paise + $1 WHERE wallet_id=$2 RETURNING *",
                    [amountPaise, tx.wallet_id]
                );
                await db.query(
                    "UPDATE wallet_transactions SET status='completed', payment_id=$1 WHERE id=$2",
                    [paymentId, tx.id]
                );
                // Record in payments table for audit
                await db.query(
                    `INSERT INTO payments (id,user_id,merchant_id,session_id,order_id,payment_id,amount_paise,status,method,raw_payload)
           VALUES ($1,$2,NULL,NULL,$3,$4,$5,'paid','topup',$6)`,
                    [uuidv4(), tx.user_id, orderId, paymentId, amountPaise, JSON.stringify(event)]
                );
                // Get new balance
                const walletRes = await db.query("SELECT balance_paise FROM wallets WHERE wallet_id=$1", [tx.wallet_id]);
                io.to(`user:${tx.user_id}`).emit("wallet:update", {
                    balancePaise: walletRes.rows[0]?.balance_paise,
                    event: "topup", amountPaise,
                });
                console.log(`[Webhook] Wallet topped up: ${tx.wallet_id} +₹${amountPaise / 100}`);
                return res.json({ ok: true });
            }

            // ── SESSION PAYMENT ───────────────────────────────────────────────────
            const sesRes = await db.query("SELECT * FROM sessions WHERE razorpay_order_id=$1", [orderId]);
            if (sesRes.rowCount === 0) { console.warn(`[Webhook] No session for order ${orderId}`); return res.json({ ok: true }); }
            const session = sesRes.rows[0];

            await db.query(
                `INSERT INTO payments (id,user_id,merchant_id,session_id,order_id,payment_id,amount_paise,status,method,raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'paid','razorpay',$8)`,
                [uuidv4(), session.user_id, session.merchant_id, session.id, orderId, paymentId, amountPaise, JSON.stringify(event)]
            );
            await db.query("UPDATE sessions SET payment_status='paid' WHERE id=$1", [session.id]);
            await db.query(
                "INSERT INTO merchant_payable (merchant_id,session_id,amount_paise,payment_id,credited_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (payment_id) DO NOTHING",
                [session.merchant_id, session.id, amountPaise, paymentId]
            );

            const successPayload = { sessionId: session.id, paymentId, amountPaise, method: "razorpay" };
            io.to(`merchant:${session.merchant_id}`).emit("payment:success", successPayload);
            io.to(`user:${session.user_id}`).emit("payment:success", successPayload);

            console.log(`[Webhook] Session payment: ${paymentId} ₹${amountPaise / 100}`);
        } catch (err) {
            console.error("[Webhook] Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
    }

    res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`\n🚀 Pulse Pay server → http://localhost:${PORT}`);
    console.log(`   Tick: ${process.env.TICK_INTERVAL_MS || 1000}ms | CORS: ${FRONTEND_URL}\n`);
});
