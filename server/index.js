/**
 * index.js — Stream Pay Express Server (MVP + In-Memory Fallback)
 *
 * When DATABASE_URL is unreachable, all data falls back to an in-process
 * memStore (lost on restart, but fully functional for demo/dev).
 *
 * APIs:
 *  Session lifecycle:
 *    POST /api/start-session
 *    POST /api/stop-session          → returns finalAmountPaise
 *    POST /api/pay-wallet            → atomic debit + emits payment:success
 *    POST /api/create-order          → Razorpay order (needs real keys)
 *    GET  /api/session/:id
 *    GET  /api/sessions/active/:merchantId  ← NEW (dashboard hydration)
 *
 *  Merchants & Services:
 *    POST /api/create-merchant
 *    GET  /api/merchant/:id
 *    POST /api/merchant/service
 *    GET  /api/merchant/:id/services
 *    GET  /api/nearby
 *
 *  Wallet:
 *    POST /api/wallet/create
 *    GET  /api/wallet/:userId      ← returns memStore balance if DB offline
 *    POST /api/wallet/topup
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
 *    POST /api/webhook/razorpay
 */
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

let db;
try { db = require("./db"); } catch { db = null; }

let razorpayModule;
try { razorpayModule = require("./razorpay"); } catch { razorpayModule = null; }

const worker = require("./worker");

const app = express();
const server = http.createServer(app);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:8080";

// Allow any local network or localhost origin (for LAN testing on phones)
function corsOrigin(origin, callback) {
    if (!origin) return callback(null, true); // non-browser (curl etc.)
    const allowed =
        /^http:\/\/localhost(:\d+)?$/.test(origin) ||
        /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
        /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/.test(origin);
    callback(allowed ? null : new Error("CORS blocked"), allowed);
}

const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});

app.use(cors({ origin: corsOrigin }));
app.use("/api/webhook/razorpay", express.raw({ type: "application/json" }));
app.use((req, res, next) => {
    if (req.path === "/api/webhook/razorpay") return next();
    express.json()(req, res, next);
});

// ─── In-Memory Store (DB fallback) ───────────────────────────────────────────
/**
 * memStore holds all runtime state when Postgres is unavailable.
 * Structure:
 *   sessions : Map<sessionId, sessionObj>
 *   wallets  : Map<userId,    { balance_paise, wallet_id }>
 *   ledger   : Map<sessionId, [{ amount_paise, ts }]>
 *   payments : Map<sessionId, paymentObj>
 *   merchants: Map<merchantId, merchantObj>
 */
const memStore = {
    sessions: new Map(),
    wallets: new Map(),
    ledger: new Map(),
    payments: new Map(),
    merchants: new Map(),
    wallet_transactions: [],

    // ── Demo merchant always available ─────────────────────────────────────
    _init() {
        if (!this.merchants.has("m_demo_gym001")) {
            this.merchants.set("m_demo_gym001", {
                id: "m_demo_gym001",
                name: "PowerZone Gym",
                service_type: "gym",
                price_per_minute_paise: 200,
                location: "Demo Location",
                lat: null,
                lng: null,
            });
        }
    },

    getWallet(userId) {
        if (!this.wallets.has(userId)) {
            this.wallets.set(userId, { balance_paise: 0, wallet_id: `PPW-${userId.slice(0, 8).toUpperCase()}` });
        }
        return this.wallets.get(userId);
    },

    debitWallet(userId, amount) {
        const w = this.getWallet(userId);
        if (w.balance_paise < amount) return null;
        w.balance_paise -= amount;
        return w;
    },

    creditWallet(userId, amount) {
        const w = this.getWallet(userId);
        w.balance_paise += amount;
        this.wallet_transactions.push({
            id: uuidv4(),
            user_id: userId,
            wallet_id: w.wallet_id,
            type: "topup",
            amount_paise: amount,
            status: "completed",
            created_at: new Date().toISOString()
        });
        return w;
    },

    addLedger(sessionId, userId, merchantId, amount) {
        if (!this.ledger.has(sessionId)) this.ledger.set(sessionId, []);
        this.ledger.get(sessionId).push({ amount_paise: amount, ts: new Date(), user_id: userId, merchant_id: merchantId });
    },

    getLedgerTotal(sessionId) {
        const rows = this.ledger.get(sessionId) || [];
        return rows.reduce((s, r) => s + r.amount_paise, 0);
    },
};
memStore._init();

// Check DB connectivity
let dbOnline = false;
async function checkDb() {
    if (!db) return;
    try {
        await db.query("SELECT 1");
        dbOnline = true;
        console.log("[DB] Connected ✅");
    } catch (e) {
        dbOnline = false;
        console.warn("[DB] Offline — using in-memory store 🔶");
    }
}
checkDb();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function decodeQRPayload(raw) {
    try { return JSON.parse(raw); } catch { }
    try { return JSON.parse(Buffer.from(raw, "base64").toString("utf8")); } catch { }
    return null;
}

function generateWalletId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "PPW-";
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    socket.on("join:merchant", (id) => {
        console.log(`[Socket] Merchant joining room: merchant:${id}`);
        socket.join(`merchant:${id}`);
    });
    socket.on("join:user", (id) => {
        console.log(`[Socket] User joining room: user:${id}`);
        socket.join(`user:${id}`);
    });
    socket.on("disconnect", () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

worker.init(io, memStore, () => dbOnline);

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/", (_, res) => res.send(`<h2>Stream Pay Backend 🚀</h2><p>DB: ${dbOnline ? "online" : "in-memory"}</p>`));
app.get("/health", (_, res) => res.json({ ok: true, dbOnline, ts: new Date().toISOString() }));

// ═════════════════════════════════════════════════════════════════════════════
// WALLET APIs
// ═════════════════════════════════════════════════════════════════════════════

app.post("/api/wallet/create", async (req, res) => {
    const { userId, displayName } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    if (dbOnline) {
        try {
            const existing = await db.query("SELECT * FROM wallets WHERE user_id = $1", [userId]);
            if (existing.rowCount > 0) return res.json({ wallet: existing.rows[0] });

            const name = displayName || `Wallet-${userId.slice(0, 6)}`;
            const safeEmail = req.body.email || `${userId}@pulsepay.test`;

            // Ensure user exists to satisfy foreign key
            await db.query(
                `INSERT INTO users (id, name, email, role) VALUES ($1, $2, $3, 'customer') ON CONFLICT (id) DO NOTHING`,
                [userId, name, safeEmail]
            );

            const walletId = generateWalletId();
            const result = await db.query(
                `INSERT INTO wallets (wallet_id, user_id, display_name, balance_paise) VALUES ($1, $2, $3, 0) RETURNING *`,
                [walletId, userId, name]
            );
            return res.json({ wallet: result.rows[0] });
        } catch (err) {
            console.warn("[wallet/create] DB error, using memStore:", err.message);
        }
    }
    const w = memStore.getWallet(userId);
    res.json({ wallet: { wallet_id: w.wallet_id, user_id: userId, balance_paise: w.balance_paise } });
});

app.get("/api/wallet/:userId", async (req, res) => {
    if (dbOnline) {
        try {
            const result = await db.query("SELECT * FROM wallets WHERE user_id = $1", [req.params.userId]);
            if (result.rowCount > 0) return res.json({ wallet: result.rows[0] });
        } catch (err) {
            console.warn("[wallet/get] DB error:", err.message);
        }
    }
    const w = memStore.getWallet(req.params.userId);
    res.json({ wallet: { wallet_id: w.wallet_id, user_id: req.params.userId, balance_paise: w.balance_paise } });
});

app.post("/api/wallet/topup", async (req, res) => {
    const { userId, amountINR } = req.body;
    if (!userId || !amountINR || amountINR <= 0) {
        return res.status(400).json({ error: "userId and amountINR (positive) required" });
    }
    const amountPaise = Math.round(parseFloat(amountINR) * 100);
    if (amountPaise < 100) return res.status(400).json({ error: "Minimum top-up is ₹1" });

    // Try Razorpay if keys available and DB is online
    if (dbOnline && razorpayModule) {
        try {
            const walletRes = await db.query("SELECT * FROM wallets WHERE user_id = $1", [userId]);
            if (walletRes.rowCount === 0) return res.status(404).json({ error: "Wallet not found" });
            const wallet = walletRes.rows[0];
            const topupId = uuidv4();
            const order = await razorpayModule.createOrder(amountPaise, `topup_${topupId}`);
            await db.query(
                `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_paise, status, razorpay_order_id, created_at)
                 VALUES ($1, $2, $3, 'topup', $4, 'pending', $5, NOW())`,
                [topupId, wallet.wallet_id, userId, amountPaise, order.id]
            );
            return res.json({ order, amountPaise, walletId: wallet.wallet_id });
        } catch (err) { console.warn("[wallet/topup] DB/Razorpay error:", err.message); }
    }

    // In-memory topup — immediately credit (no Razorpay for demo)
    const updated = memStore.creditWallet(userId, amountPaise);
    io.to(`user:${userId}`).emit("wallet:update", { balancePaise: updated.balance_paise, event: "topup", amountPaise });
    res.json({ ok: true, newBalancePaise: updated.balance_paise, amountPaise, note: "In-memory topup (no Razorpay)" });
});

app.get("/api/wallet/transactions/:userId", async (req, res) => {
    if (dbOnline) {
        try {
            const result = await db.query(
                `SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
                [req.params.userId]
            );
            return res.json({ transactions: result.rows });
        } catch (err) { console.warn("[wallet/transactions] DB error:", err.message); }
    }
    // Build from memStore explicitly stored transactions
    const txs = memStore.wallet_transactions.filter(t => t.user_id === req.params.userId) || [];
    res.json({ transactions: txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) });
});

// POST /api/wallet/credit — direct credit (for simulated UPI collect)
app.post("/api/wallet/credit", async (req, res) => {
    const { userId, amountPaise } = req.body;
    if (!userId || !amountPaise || amountPaise <= 0) {
        return res.status(400).json({ error: "userId and amountPaise required" });
    }
    if (dbOnline) {
        try {
            const walletRes = await db.query(
                "UPDATE wallets SET balance_paise = balance_paise + $1 WHERE user_id = $2 RETURNING *",
                [amountPaise, userId]
            );
            if (walletRes.rowCount === 0) return res.status(404).json({ error: "Wallet not found" });
            const newBalance = walletRes.rows[0].balance_paise;
            const walletId = walletRes.rows[0].wallet_id;
            await db.query(
                `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_paise, status, created_at)
                 VALUES ($1, $2, $3, 'topup', $4, 'completed', NOW())`,
                [uuidv4(), walletId, userId, amountPaise]
            );
            io.to(`user:${userId}`).emit("wallet:update", { balancePaise: newBalance, event: "topup", amountPaise });
            return res.json({ ok: true, newBalancePaise: newBalance });
        } catch (err) { console.warn("[wallet/credit] DB error:", err.message); }
    }
    // In-memory fallback
    const updated = memStore.creditWallet(userId, amountPaise);
    io.to(`user:${userId}`).emit("wallet:update", { balancePaise: updated.balance_paise, event: "topup", amountPaise });
    res.json({ ok: true, newBalancePaise: updated.balance_paise });
});


app.post("/api/pay-wallet", async (req, res) => {
    const { userId, sessionId } = req.body;
    if (!userId || !sessionId) return res.status(400).json({ error: "userId and sessionId required" });

    if (dbOnline) {
        const client = await db.getClient();
        try {
            await client.query("BEGIN");
            const sesRes = await client.query("SELECT * FROM sessions WHERE id = $1", [sessionId]);
            if (sesRes.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Session not found" }); }
            const session = sesRes.rows[0];
            if (session.payment_status === "paid") { await client.query("ROLLBACK"); return res.status(409).json({ error: "Already paid" }); }
            const finalAmountPaise = session.final_amount_paise || 0;
            if (finalAmountPaise <= 0) { await client.query("ROLLBACK"); return res.status(400).json({ error: "No amount to charge" }); }

            // The worker has already deducted finalAmountPaise over time, so we just read the final balance
            const walletRes = await client.query(
                `SELECT wallet_id, balance_paise FROM wallets WHERE user_id = $1`,
                [userId]
            );
            if (walletRes.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Wallet not found" }); }

            const paymentId = `ppw_${uuidv4().replace(/-/g, "").slice(0, 16)}`;

            // Add a single consolidated transaction for history
            await client.query(
                `INSERT INTO wallet_transactions (id, wallet_id, user_id, type, amount_paise, status, session_id, created_at)
                 VALUES ($1, $2, $3, 'payment', $4, 'completed', $5, NOW())`,
                [uuidv4(), walletRes.rows[0].wallet_id, userId, finalAmountPaise, sessionId]
            );

            await client.query(
                `INSERT INTO payments (id, user_id, merchant_id, session_id, order_id, payment_id, amount_paise, status, method)
                 VALUES ($1, $2, $3, $4, 'wallet', $5, $6, 'paid', 'wallet')`,
                [uuidv4(), userId, session.merchant_id, sessionId, paymentId, finalAmountPaise]
            );
            await client.query("UPDATE sessions SET payment_status = 'paid' WHERE id = $1", [sessionId]);
            await client.query(
                `INSERT INTO merchant_payable (merchant_id, session_id, amount_paise, payment_id, credited_at)
                 VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (payment_id) DO NOTHING`,
                [session.merchant_id, sessionId, finalAmountPaise, paymentId]
            );
            await client.query("COMMIT");
            const successPayload = { sessionId, paymentId, amountPaise: finalAmountPaise, method: "wallet" };
            io.to(`merchant:${session.merchant_id}`).emit("payment:success", successPayload);
            io.to(`user:${userId}`).emit("payment:success", successPayload);
            io.to(`user:${userId}`).emit("wallet:update", { balancePaise: walletRes.rows[0].balance_paise });
            return res.json({ ok: true, paymentId, newBalancePaise: walletRes.rows[0].balance_paise });
        } catch (err) {
            await client.query("ROLLBACK");
            console.error("[pay-wallet] DB error:", err.message);
        } finally { client.release(); }
    }

    // ── In-memory pay-wallet ──────────────────────────────────────────────────
    const session = memStore.sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.payment_status === "paid") return res.status(409).json({ error: "Already paid" });

    const finalAmountPaise = session.final_amount_paise || memStore.getLedgerTotal(sessionId);
    if (finalAmountPaise <= 0) {
        // Nothing to charge — just mark as paid
        session.payment_status = "paid";
        const paymentId = `ppw_free_${Date.now()}`;
        const successPayload = { sessionId, paymentId, amountPaise: 0, method: "wallet" };
        io.to(`merchant:${session.merchant_id}`).emit("payment:success", successPayload);
        io.to(`user:${userId}`).emit("payment:success", successPayload);
        return res.json({ ok: true, paymentId, newBalancePaise: memStore.getWallet(userId).balance_paise });
    }

    const updatedWallet = memStore.getWallet(userId);

    // Create one consolidated transaction history record
    memStore.wallet_transactions.push({
        id: uuidv4(),
        user_id: userId,
        wallet_id: updatedWallet.wallet_id,
        type: "payment",
        amount_paise: finalAmountPaise,
        status: "completed",
        session_id: sessionId,
        created_at: new Date().toISOString()
    });

    const paymentId = `ppw_${uuidv4().replace(/-/g, "").slice(0, 16)}`;
    session.payment_status = "paid";
    memStore.payments.set(sessionId, {
        sessionId, paymentId, amountPaise: finalAmountPaise, method: "wallet",
        userId, merchantId: session.merchant_id, createdAt: new Date().toISOString(),
    });

    const successPayload = { sessionId, paymentId, amountPaise: finalAmountPaise, method: "wallet" };
    io.to(`merchant:${session.merchant_id}`).emit("payment:success", successPayload);
    io.to(`user:${userId}`).emit("payment:success", successPayload);
    io.to(`user:${userId}`).emit("wallet:update", { balancePaise: updatedWallet.balance_paise });

    console.log(`[pay-wallet] MemStore: ${userId} paid ₹${finalAmountPaise / 100} for session ${sessionId}`);
    res.json({ ok: true, paymentId, newBalancePaise: updatedWallet.balance_paise });
});

// ═════════════════════════════════════════════════════════════════════════════
// MERCHANT APIs
// ═════════════════════════════════════════════════════════════════════════════

const VALID_SERVICE_TYPES = ["gym", "ev", "parking", "coworking", "wifi", "spa", "vending"];

app.post("/api/create-merchant", async (req, res) => {
    const { name, serviceType, pricePerMinute, location, lat, lng, userId } = req.body;
    if (!name || !VALID_SERVICE_TYPES.includes(serviceType)) {
        return res.status(400).json({ error: "name and valid serviceType required" });
    }
    const pricePerMinutePaise = Math.round(parseFloat(pricePerMinute || "2") * 100);
    const merchantId = `m_${uuidv4().replace(/-/g, "").slice(0, 12)}`;

    if (dbOnline) {
        try {
            const result = await db.query(
                `INSERT INTO merchants (id, name, service_type, price_per_minute_paise, location, lat, lng, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [merchantId, name, serviceType, pricePerMinutePaise, location || "", lat || null, lng || null, userId || null]
            );
            const startQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "start" })).toString("base64");
            const stopQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "stop" })).toString("base64");
            return res.json({ merchant: result.rows[0], qr: { start: startQR, stop: stopQR } });
        } catch (err) { console.warn("[create-merchant] DB error:", err.message); }
    }
    const merchant = { id: merchantId, name, service_type: serviceType, price_per_minute_paise: pricePerMinutePaise, location: location || "", lat: lat || null, lng: lng || null, user_id: userId || null };
    memStore.merchants.set(merchantId, merchant);
    const startQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "start" })).toString("base64");
    const stopQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "stop" })).toString("base64");
    res.json({ merchant, qr: { start: startQR, stop: stopQR } });
});

app.get("/api/merchant/:id", async (req, res) => {
    if (dbOnline) {
        try {
            const r = await db.query("SELECT * FROM merchants WHERE id = $1", [req.params.id]);
            if (r.rowCount > 0) return res.json(r.rows[0]);
        } catch (err) { console.warn("[merchant/get] DB error:", err.message); }
    }
    const m = memStore.merchants.get(req.params.id);
    if (!m) return res.status(404).json({ error: "Not found" });
    res.json(m);
});

// GET /api/merchant/by-user/:userId — lookup merchant linked to a user account
app.get("/api/merchant/by-user/:userId", async (req, res) => {
    const { userId } = req.params;
    if (dbOnline) {
        try {
            const r = await db.query("SELECT * FROM merchants WHERE user_id = $1 LIMIT 1", [userId]);
            if (r.rowCount > 0) return res.json({ merchant: r.rows[0] });
            return res.json({ merchant: null });
        } catch (err) { console.warn("[merchant/by-user] DB error:", err.message); }
    }
    // memStore lookup
    const found = [...memStore.merchants.values()].find(m => m.user_id === userId);
    res.json({ merchant: found || null });
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
            const startQR = Buffer.from(JSON.stringify({ merchantId, merchantServiceId: serviceId, serviceType, action: "start" })).toString("base64");
            const stopQR = Buffer.from(JSON.stringify({ merchantId, merchantServiceId: serviceId, serviceType, action: "stop" })).toString("base64");
            return res.json({ service: result.rows[0], qr: { start: startQR, stop: stopQR } });
        } catch (err) { console.warn("[merchant/service] DB error:", err.message); }
    }
    const service = { id: serviceId, merchant_id: merchantId, service_type: serviceType, price_per_minute_paise: pricePerMinutePaise, description: description || "" };
    const startQR = Buffer.from(JSON.stringify({ merchantId, merchantServiceId: serviceId, serviceType, action: "start" })).toString("base64");
    const stopQR = Buffer.from(JSON.stringify({ merchantId, merchantServiceId: serviceId, serviceType, action: "stop" })).toString("base64");
    res.json({ service, qr: { start: startQR, stop: stopQR } });
});

app.get("/api/merchant/:id/services", async (req, res) => {
    if (dbOnline) {
        try {
            const r = await db.query("SELECT * FROM merchant_services WHERE merchant_id = $1 ORDER BY created_at", [req.params.id]);
            return res.json({ services: r.rows });
        } catch (err) { console.warn("[merchant/services] DB error:", err.message); }
    }
    res.json({ services: [] });
});

app.get("/api/nearby", async (req, res) => {
    const { lat, lng, radius = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });
    if (dbOnline) {
        try {
            const merchants = await db.query("SELECT *, lat::float AS lat_f, lng::float AS lng_f FROM merchants WHERE lat IS NOT NULL AND lng IS NOT NULL");
            const nearby = merchants.rows.map(m => {
                const dist = haversine(parseFloat(lat), parseFloat(lng), m.lat_f, m.lng_f);
                return { ...m, distanceKm: Math.round(dist * 100) / 100 };
            }).filter(m => m.distanceKm <= parseFloat(radius)).sort((a, b) => a.distanceKm - b.distanceKm);
            return res.json({ nearby });
        } catch (err) { console.warn("[nearby] DB error:", err.message); }
    }
    // Return memStore merchants with lat/lng
    const nearby = [...memStore.merchants.values()]
        .filter(m => m.lat && m.lng)
        .map(m => ({ ...m, distanceKm: haversine(parseFloat(lat), parseFloat(lng), m.lat, m.lng) }))
        .filter(m => m.distanceKm <= parseFloat(radius))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    res.json({ nearby });
});

// ═════════════════════════════════════════════════════════════════════════════
// ADS
// ═════════════════════════════════════════════════════════════════════════════

const memAds = new Map(); // merchantId -> [ad]

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
        } catch (err) { console.warn("[ads/create] DB error:", err.message); }
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
        } catch (err) { console.warn("[ads/get] DB error:", err.message); }
    }
    res.json({ ads: memAds.get(req.params.merchantId) || [] });
});

// ═════════════════════════════════════════════════════════════════════════════
// SESSION APIs
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/sessions/active/:merchantId — hydrate merchant dashboard on mount
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
            const sessions = await Promise.all(r.rows.map(async (s) => {
                const led = await db.query("SELECT COALESCE(SUM(amount_paise),0)::int AS total FROM ledger WHERE session_id=$1", [s.id]);
                const elap = await db.query("SELECT EXTRACT(EPOCH FROM (NOW()-started_at))::int AS e FROM sessions WHERE id=$1", [s.id]);
                return {
                    sessionId: s.id, userId: s.user_id, merchantId: s.merchant_id,
                    merchantName: s.merchant_name, serviceType: s.service_type,
                    startedAt: s.started_at, pricePerMinutePaise: s.price_per_minute_paise,
                    elapsedSec: elap.rows[0]?.e || 0,
                    totalDebitedPaise: led.rows[0]?.total || 0,
                    status: s.status,
                };
            }));
            return res.json({ sessions });
        } catch (err) { console.warn("[sessions/active] DB error:", err.message); }
    }
    // In-memory
    const sessions = [...memStore.sessions.values()]
        .filter(s => s.merchant_id === merchantId && (s.status === "active" || s.status === "paused_low_balance"))
        .map(s => {
            const now = Date.now();
            const elapsedSec = Math.floor((now - new Date(s.started_at).getTime()) / 1000);
            return {
                sessionId: s.id, userId: s.user_id, merchantId: s.merchant_id,
                merchantName: s.merchant_name || "PowerZone Gym",
                serviceType: s.service_type, startedAt: s.started_at,
                pricePerMinutePaise: s.price_per_minute_paise,
                elapsedSec, totalDebitedPaise: memStore.getLedgerTotal(s.id),
                status: s.status,
            };
        });
    res.json({ sessions });
});

// GET /api/sessions/active/user/:userId — hydrate customer dashboard on mount
app.get("/api/sessions/active/user/:userId", async (req, res) => {
    const { userId } = req.params;
    if (dbOnline) {
        try {
            const r = await db.query(
                `SELECT s.*, m.name AS merchant_name, m.price_per_minute_paise
                 FROM sessions s JOIN merchants m ON m.id = s.merchant_id
                 WHERE s.user_id = $1 AND s.status IN ('active','paused_low_balance')
                 ORDER BY s.started_at DESC`,
                [userId]
            );
            const sessions = await Promise.all(r.rows.map(async (s) => {
                const led = await db.query("SELECT COALESCE(SUM(amount_paise),0)::int AS total FROM ledger WHERE session_id=$1", [s.id]);
                const elap = await db.query("SELECT EXTRACT(EPOCH FROM (NOW()-started_at))::int AS e FROM sessions WHERE id=$1", [s.id]);
                return {
                    sessionId: s.id, userId: s.user_id, merchantId: s.merchant_id,
                    merchantName: s.merchant_name, serviceType: s.service_type,
                    startedAt: s.started_at, pricePerMinutePaise: s.price_per_minute_paise,
                    elapsedSec: elap.rows[0]?.e || 0,
                    totalDebitedPaise: led.rows[0]?.total || 0,
                    status: s.status,
                };
            }));
            return res.json({ sessions });
        } catch (err) { console.warn("[sessions/active/user] DB error:", err.message); }
    }
    // In-memory
    const sessions = [...memStore.sessions.values()]
        .filter(s => s.user_id === userId && (s.status === "active" || s.status === "paused_low_balance"))
        .map(s => {
            const now = Date.now();
            const elapsedSec = Math.floor((now - new Date(s.started_at).getTime()) / 1000);
            return {
                sessionId: s.id, userId: s.user_id, merchantId: s.merchant_id,
                merchantName: s.merchant_name || "PowerZone Gym",
                serviceType: s.service_type, startedAt: s.started_at,
                pricePerMinutePaise: s.price_per_minute_paise,
                elapsedSec, totalDebitedPaise: memStore.getLedgerTotal(s.id),
                status: s.status,
            };
        });
    res.json({ sessions });
});

// POST /api/start-session
app.post("/api/start-session", async (req, res) => {
    let { userId, merchantId, merchantServiceId, serviceType, payload } = req.body;
    if (payload) {
        const d = decodeQRPayload(payload);
        if (!d || d.action !== "start") return res.status(400).json({ error: "Invalid start payload" });
        merchantId = d.merchantId; serviceType = d.serviceType; merchantServiceId = d.merchantServiceId;
    }
    if (!userId || !merchantId) return res.status(400).json({ error: "userId and merchantId required" });

    if (dbOnline) {
        try {
            const mRes = await db.query("SELECT * FROM merchants WHERE id = $1", [merchantId]);
            if (mRes.rowCount === 0) throw new Error("Merchant not found in DB");
            const merchant = mRes.rows[0];
            let pricePerMinutePaise = merchant.price_per_minute_paise;
            if (merchantServiceId) {
                const svcRes = await db.query("SELECT * FROM merchant_services WHERE id = $1", [merchantServiceId]);
                if (svcRes.rowCount > 0) pricePerMinutePaise = svcRes.rows[0].price_per_minute_paise;
            }
            const dup = await db.query(
                "SELECT id FROM sessions WHERE user_id = $1 AND merchant_id = $2 AND status IN ('active','paused_low_balance')",
                [userId, merchantId]
            );
            if (dup.rowCount > 0) return res.status(409).json({ error: "Active session exists", sessionId: dup.rows[0].id });

            // Ensure user exists to satisfy foreign key
            const safeEmail = req.body.email || `${userId}@pulsepay.test`;
            await db.query(
                `INSERT INTO users (id, name, email, role) VALUES ($1, $2, $3, 'customer') ON CONFLICT (id) DO NOTHING`,
                [userId, `User-${userId.slice(0, 6)}`, safeEmail]
            );

            const sessionId = uuidv4();
            const sesRes = await db.query(
                `INSERT INTO sessions (id, user_id, merchant_id, merchant_service_id, service_type, started_at, status, payment_status, price_per_minute_paise)
                 VALUES ($1,$2,$3,$4,$5,NOW(),'active','pending',$6) RETURNING *`,
                [sessionId, userId, merchantId, merchantServiceId || null, serviceType || merchant.service_type, pricePerMinutePaise]
            );
            const session = sesRes.rows[0];
            const eventData = { sessionId, userId, merchantId, startedAt: session.started_at, pricePerMinutePaise, serviceType: session.service_type, merchantName: merchant.name };
            io.to(`merchant:${merchantId}`).emit("session:start", eventData);
            io.to(`user:${userId}`).emit("session:start", eventData);
            const adsRes = await db.query("SELECT * FROM advertisements WHERE merchant_id = $1 AND active = true LIMIT 3", [merchantId]);
            return res.json({ session, merchant, ads: adsRes.rows });
        } catch (err) { console.warn("[start-session] DB error, using memStore:", err.message); }
    }

    // ── In-memory start session ───────────────────────────────────────────────
    const merchant = memStore.merchants.get(merchantId) || {
        id: merchantId, name: "PowerZone Gym", service_type: serviceType || "gym",
        price_per_minute_paise: 200,
    };
    const pricePerMinutePaise = merchant.price_per_minute_paise;

    // Duplicate check
    for (const [, s] of memStore.sessions) {
        if (s.user_id === userId && s.merchant_id === merchantId && (s.status === "active" || s.status === "paused_low_balance")) {
            return res.status(409).json({ error: "Active session exists", sessionId: s.id });
        }
    }

    const sessionId = uuidv4();
    const startedAt = new Date().toISOString();
    const session = {
        id: sessionId, user_id: userId, merchant_id: merchantId,
        merchant_name: merchant.name,
        service_type: serviceType || merchant.service_type,
        started_at: startedAt, status: "active", payment_status: "pending",
        price_per_minute_paise: pricePerMinutePaise,
        final_amount_paise: 0,
    };
    memStore.sessions.set(sessionId, session);

    const eventData = {
        sessionId, userId, merchantId, startedAt,
        pricePerMinutePaise, serviceType: session.service_type, merchantName: merchant.name,
    };
    console.log(`[API] start-session (memStore) → emitting to merchant:${merchantId} and user:${userId}`);
    io.to(`merchant:${merchantId}`).emit("session:start", eventData);
    io.to(`user:${userId}`).emit("session:start", eventData);

    const ads = memAds.get(merchantId) || [];
    res.json({ session, merchant, ads: ads.slice(0, 3) });
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

    if (dbOnline) {
        try {
            const sesRes = await db.query(
                "SELECT * FROM sessions WHERE user_id=$1 AND merchant_id=$2 AND status IN ('active','paused_low_balance') ORDER BY started_at DESC LIMIT 1",
                [userId, merchantId]
            );
            if (sesRes.rowCount === 0) throw new Error("No active session in DB");
            const session = sesRes.rows[0];
            const ledRes = await db.query("SELECT COALESCE(SUM(amount_paise),0)::int AS total FROM ledger WHERE session_id=$1", [session.id]);
            const finalAmountPaise = ledRes.rows[0].total;
            const durRes = await db.query("SELECT EXTRACT(EPOCH FROM (NOW()-started_at))::int AS d FROM sessions WHERE id=$1", [session.id]);
            const durationSec = durRes.rows[0]?.d || 0;
            await db.query("UPDATE sessions SET status='stopped', ended_at=NOW(), final_amount_paise=$1 WHERE id=$2", [finalAmountPaise, session.id]);
            const walletRes = await db.query("SELECT balance_paise FROM wallets WHERE user_id=$1", [userId]);
            const walletBalance = walletRes.rows[0]?.balance_paise || 0;
            const stopPayload = { sessionId: session.id, durationSec, finalAmountPaise };
            io.to(`merchant:${merchantId}`).emit("session:stop", stopPayload);
            io.to(`user:${userId}`).emit("session:stop", stopPayload);
            return res.json({ session: { ...session, status: "stopped", final_amount_paise: finalAmountPaise, duration_sec: durationSec }, finalAmountPaise, durationSec, walletBalance });
        } catch (err) { console.warn("[stop-session] DB error, using memStore:", err.message); }
    }

    // ── In-memory stop session ────────────────────────────────────────────────
    let session = null;
    for (const [, s] of memStore.sessions) {
        if (s.user_id === userId && s.merchant_id === merchantId && (s.status === "active" || s.status === "paused_low_balance")) {
            session = s; break;
        }
    }
    if (!session) return res.status(404).json({ error: "No active session" });

    const finalAmountPaise = memStore.getLedgerTotal(session.id);
    const durationSec = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
    session.status = "stopped";
    session.ended_at = new Date().toISOString();
    session.final_amount_paise = finalAmountPaise;

    const walletBalance = memStore.getWallet(userId).balance_paise;
    const stopPayload = { sessionId: session.id, durationSec, finalAmountPaise };
    io.to(`merchant:${merchantId}`).emit("session:stop", stopPayload);
    io.to(`user:${userId}`).emit("session:stop", stopPayload);

    console.log(`[API] stop-session (memStore) → sessionId=${session.id}, finalAmountPaise=${finalAmountPaise}`);
    res.json({ session: { ...session, duration_sec: durationSec }, finalAmountPaise, durationSec, walletBalance });
});

// POST /api/create-order (Razorpay)
app.post("/api/create-order", async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    // Try DB path
    if (dbOnline && razorpayModule) {
        try {
            const sesRes = await db.query("SELECT * FROM sessions WHERE id=$1", [sessionId]);
            if (sesRes.rowCount > 0) {
                const session = sesRes.rows[0];
                const amountPaise = Math.max(session.final_amount_paise || 100, 100);
                const order = await razorpayModule.createOrder(amountPaise, sessionId);
                await db.query("UPDATE sessions SET razorpay_order_id=$1 WHERE id=$2", [order.id, sessionId]);
                return res.json({ order, amountPaise });
            }
        } catch (err) { console.warn("[create-order] DB error:", err.message); }
    }

    // memStore path — try Razorpay with memStore session
    const session = memStore.sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const amountPaise = Math.max(session.final_amount_paise || 100, 100);
    if (razorpayModule) {
        try {
            const order = await razorpayModule.createOrder(amountPaise, sessionId);
            return res.json({ order, amountPaise });
        } catch (err) { console.warn("[create-order] Razorpay error:", err.message); }
    }
    res.status(503).json({ error: "Payment gateway unavailable. Use wallet payment." });
});

// GET /api/session/:id
app.get("/api/session/:id", async (req, res) => {
    if (dbOnline) {
        try {
            const s = await db.query(
                "SELECT s.*, m.name AS merchant_name, m.service_type, m.price_per_minute_paise FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.id=$1",
                [req.params.id]
            );
            if (s.rowCount > 0) {
                const l = await db.query("SELECT * FROM ledger WHERE session_id=$1 ORDER BY ts DESC LIMIT 200", [req.params.id]);
                return res.json({ session: s.rows[0], ledger: l.rows });
            }
        } catch (err) { console.warn("[session/get] DB error:", err.message); }
    }
    const session = memStore.sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "Not found" });
    const ledger = memStore.ledger.get(req.params.id) || [];
    res.json({ session, ledger });
});

// GET /api/transactions/:userId
app.get("/api/transactions/:userId", async (req, res) => {
    const { userId } = req.params;
    if (dbOnline) {
        try {
            const sessions = await db.query(
                "SELECT s.*, m.name AS merchant_name, m.service_type FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.user_id=$1 ORDER BY s.started_at DESC LIMIT 50",
                [userId]
            );
            const payments = await db.query(
                "SELECT p.*, m.name AS merchant_name FROM payments p JOIN merchants m ON m.id=p.merchant_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 50",
                [userId]
            );
            return res.json({ sessions: sessions.rows, payments: payments.rows, ledger: [] });
        } catch (err) { console.warn("[transactions] DB error:", err.message); }
    }
    // memStore
    const sessions = [...memStore.sessions.values()]
        .filter(s => s.user_id === userId)
        .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
        .map(s => ({
            ...s, id: s.id,
            merchant_name: s.merchant_name || "Merchant",
            service_type: s.service_type,
        }));
    const payments = [...memStore.payments.values()].filter(p => p.userId === userId);
    res.json({ sessions, payments, ledger: [] });
});

// GET /api/payments/:merchantId — real payment history for merchant dashboard
app.get("/api/payments/:merchantId", async (req, res) => {
    const { merchantId } = req.params;
    if (dbOnline) {
        try {
            const result = await db.query(
                `SELECT p.*, m.name AS merchant_name, m.service_type, s.started_at, s.ended_at, s.price_per_minute_paise
                 FROM payments p
                 JOIN merchants m ON m.id = p.merchant_id
                 JOIN sessions s ON s.id = p.session_id
                 WHERE p.merchant_id = $1
                 ORDER BY p.created_at DESC LIMIT 200`,
                [merchantId]
            );
            return res.json({ payments: result.rows });
        } catch (err) { console.warn("[payments/merchant] DB error:", err.message); }
    }
    // memStore — collect payments for this merchant
    const allPayments = [...memStore.payments.values()]
        .filter(p => p.merchantId === merchantId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ payments: allPayments });
});

// GET /api/invoice/:sessionId
app.get("/api/invoice/:sessionId", async (req, res) => {
    if (dbOnline) {
        try {
            const s = await db.query(
                "SELECT s.*, m.name AS merchant_name, m.service_type, m.location FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.id=$1",
                [req.params.sessionId]
            );
            if (s.rowCount > 0) {
                const session = s.rows[0];
                const l = await db.query("SELECT * FROM ledger WHERE session_id=$1 ORDER BY ts", [req.params.sessionId]);
                const p = await db.query("SELECT * FROM payments WHERE session_id=$1", [req.params.sessionId]);
                const invoice = {
                    invoiceId: `INV-${req.params.sessionId.slice(0, 8).toUpperCase()}`,
                    generatedAt: new Date().toISOString(),
                    merchant: { name: session.merchant_name, serviceType: session.service_type, location: session.location },
                    session: { id: session.id, startedAt: session.started_at, endedAt: session.ended_at, finalAmountPaise: session.final_amount_paise, finalAmountINR: (session.final_amount_paise / 100).toFixed(2), status: session.status, paymentStatus: session.payment_status },
                    ledgerSummary: { totalTicks: l.rows.length, totalDebitedPaise: l.rows.reduce((s, r) => s + r.amount_paise, 0) },
                    payment: p.rows[0] || null,
                };
                res.setHeader("Content-Disposition", `attachment; filename="invoice_${invoice.invoiceId}.json"`);
                return res.json(invoice);
            }
        } catch (err) { console.warn("[invoice] DB error:", err.message); }
    }
    const session = memStore.sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Not found" });
    const payment = memStore.payments.get(req.params.sessionId);
    const merchant = memStore.merchants.get(session.merchant_id) || {};
    const invoice = {
        invoiceId: `INV-${req.params.sessionId.slice(0, 8).toUpperCase()}`,
        generatedAt: new Date().toISOString(),
        merchant: { name: merchant.name || session.merchant_name, serviceType: session.service_type, location: merchant.location || "—" },
        session: { id: session.id, startedAt: session.started_at, endedAt: session.ended_at, finalAmountPaise: session.final_amount_paise, finalAmountINR: ((session.final_amount_paise || 0) / 100).toFixed(2), status: session.status, paymentStatus: session.payment_status },
        ledgerSummary: { totalTicks: (memStore.ledger.get(req.params.sessionId) || []).length, totalDebitedPaise: memStore.getLedgerTotal(req.params.sessionId) },
        payment: payment || null,
    };
    res.setHeader("Content-Disposition", `attachment; filename="invoice_${invoice.invoiceId}.json"`);
    res.json(invoice);
});

// ═════════════════════════════════════════════════════════════════════════════
// WEBHOOK
// ═════════════════════════════════════════════════════════════════════════════
app.post("/api/webhook/razorpay", async (req, res) => {
    if (!razorpayModule) return res.status(503).json({ error: "Razorpay not configured" });
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) return res.status(400).json({ error: "Missing signature" });
    const rawBody = req.body;
    if (!razorpayModule.verifyWebhookSignature(rawBody, signature)) {
        return res.status(400).json({ error: "Invalid signature" });
    }
    let event;
    try { event = JSON.parse(rawBody.toString("utf8")); } catch { return res.status(400).json({ error: "Bad JSON" }); }

    if (event.event === "payment.captured") {
        const payment = event.payload.payment.entity;
        const { order_id: orderId, id: paymentId, amount: amountPaise } = payment;
        if (dbOnline) {
            try {
                const dup = await db.query("SELECT id FROM payments WHERE payment_id=$1", [paymentId]);
                if (dup.rowCount > 0) return res.json({ ok: true });
                const sesRes = await db.query("SELECT * FROM sessions WHERE razorpay_order_id=$1", [orderId]);
                if (sesRes.rowCount > 0) {
                    const session = sesRes.rows[0];
                    await db.query(`INSERT INTO payments (id,user_id,merchant_id,session_id,order_id,payment_id,amount_paise,status,method,raw_payload) VALUES ($1,$2,$3,$4,$5,$6,$7,'paid','razorpay',$8)`,
                        [uuidv4(), session.user_id, session.merchant_id, session.id, orderId, paymentId, amountPaise, JSON.stringify(event)]);
                    await db.query("UPDATE sessions SET payment_status='paid' WHERE id=$1", [session.id]);
                    const successPayload = { sessionId: session.id, paymentId, amountPaise, method: "razorpay" };
                    io.to(`merchant:${session.merchant_id}`).emit("payment:success", successPayload);
                    io.to(`user:${session.user_id}`).emit("payment:success", successPayload);
                }
            } catch (err) { console.error("[Webhook] Error:", err.message); }
        }
    }
    res.json({ ok: true });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`\n🚀 Stream Pay server → http://localhost:${PORT}`);
    console.log(`   Tick: ${process.env.TICK_INTERVAL_MS || 1000}ms | CORS: ${FRONTEND_URL}\n`);
});
