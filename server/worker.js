/**
 * worker.js — Stream Pay streaming debit worker (In-Memory Fallback)
 *
 * Works with both a live Postgres DB and the in-memory memStore from index.js.
 * On every tick:
 *  1. Query active sessions (DB or memStore)
 *  2. Atomic wallet debit (DB UPDATE or memStore.debitWallet)
 *  3. Insert ledger entry (DB or memStore.addLedger)
 *  4. Emit session:update to merchant + user rooms
 *  On insufficient funds: pause session, emit session:paused
 */
require("dotenv").config();

let db;
try { db = require("./db"); } catch { db = null; }

const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "1000", 10);
const TICK_SECONDS = TICK_INTERVAL_MS / 1000;

let io;
let memStore;
let isDbOnline;

function init(ioInstance, memStoreRef, isDbOnlineFn) {
    io = ioInstance;
    memStore = memStoreRef;
    isDbOnline = isDbOnlineFn;
    setInterval(tick, TICK_INTERVAL_MS);
    console.log(`[Worker] Started. Tick: ${TICK_INTERVAL_MS}ms (${TICK_SECONDS}s)`);
}

async function tick() {
    // Prefer DB path when online
    if (db && isDbOnline && isDbOnline()) {
        await tickDb();
    } else {
        tickMem();
    }
}

// ── DB tick ──────────────────────────────────────────────────────────────────
async function tickDb() {
    let activeSessions;
    try {
        const result = await db.query(
            `SELECT s.id AS session_id, s.user_id, s.merchant_id, s.started_at, s.price_per_minute_paise
             FROM sessions s WHERE s.status = 'active'`
        );
        activeSessions = result.rows;
    } catch (err) {
        console.error("[Worker/DB] Failed to fetch sessions:", err.message);
        return;
    }
    for (const session of activeSessions) {
        await processSessionDb(session);
    }
}

async function processSessionDb(session) {
    const { session_id, user_id, merchant_id, price_per_minute_paise } = session;
    const pricePaisePerSec = Math.round(price_per_minute_paise / 60);
    const debitPaise = pricePaisePerSec * TICK_SECONDS;
    if (debitPaise <= 0) return;

    const client = await db.getClient();
    try {
        await client.query("BEGIN");
        const walletRes = await client.query(
            `UPDATE wallets SET balance_paise = balance_paise - $1
             WHERE user_id = $2 AND balance_paise >= $1
             RETURNING wallet_id, balance_paise`,
            [debitPaise, user_id]
        );
        if (walletRes.rowCount === 0) {
            await client.query("UPDATE sessions SET status='paused_low_balance' WHERE id=$1", [session_id]);
            await client.query("COMMIT");
            if (io) {
                const payload = { sessionId: session_id, reason: "insufficient_funds" };
                io.to(`merchant:${merchant_id}`).emit("session:paused", payload);
                io.to(`user:${user_id}`).emit("session:paused", payload);
            }
            return;
        }
        const { wallet_id, balance_paise: newBalance } = walletRes.rows[0];
        await client.query(
            "INSERT INTO ledger (session_id, user_id, merchant_id, amount_paise, ts) VALUES ($1,$2,$3,$4,NOW())",
            [session_id, user_id, merchant_id, debitPaise]
        );
        await client.query(
            `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount_paise, status, session_id, created_at)
             VALUES ($1,$2,'debit',$3,'completed',$4,NOW())`,
            [wallet_id, user_id, debitPaise, session_id]
        );
        const totalRes = await client.query(
            "SELECT COALESCE(SUM(amount_paise),0)::int AS total FROM ledger WHERE session_id=$1",
            [session_id]
        );
        const totalDebitedPaise = totalRes.rows[0].total;
        const elapsedRes = await client.query(
            "SELECT EXTRACT(EPOCH FROM (NOW()-started_at))::int AS e FROM sessions WHERE id=$1",
            [session_id]
        );
        const elapsedSec = elapsedRes.rows[0]?.e || 0;
        await client.query("COMMIT");
        if (io) {
            const update = { sessionId: session_id, elapsedSec, totalDebitedPaise, walletBalancePaise: newBalance };
            io.to(`merchant:${merchant_id}`).emit("session:update", update);
            io.to(`user:${user_id}`).emit("session:update", update);
        }
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[Worker/DB] Error session ${session_id}:`, err.message);
    } finally {
        client.release();
    }
}

// ── In-Memory tick ────────────────────────────────────────────────────────────
function tickMem() {
    if (!memStore) return;
    for (const [, session] of memStore.sessions) {
        if (session.status !== "active") continue;
        processSesionMem(session);
    }
}

function processSesionMem(session) {
    const { id: session_id, user_id, merchant_id, price_per_minute_paise } = session;
    const pricePaisePerSec = Math.round(price_per_minute_paise / 60);
    const debitPaise = pricePaisePerSec * TICK_SECONDS;
    if (debitPaise <= 0) return;

    const updatedWallet = memStore.debitWallet(user_id, debitPaise);
    if (!updatedWallet) {
        // Insufficient funds — pause session
        session.status = "paused_low_balance";
        if (io) {
            const payload = { sessionId: session_id, reason: "insufficient_funds" };
            io.to(`merchant:${merchant_id}`).emit("session:paused", payload);
            io.to(`user:${user_id}`).emit("session:paused", payload);
        }
        return;
    }

    memStore.addLedger(session_id, user_id, merchant_id, debitPaise);
    const totalDebitedPaise = memStore.getLedgerTotal(session_id);
    const elapsedSec = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);

    if (io) {
        const update = {
            sessionId: session_id, elapsedSec, totalDebitedPaise,
            walletBalancePaise: updatedWallet.balance_paise,
        };
        io.to(`merchant:${merchant_id}`).emit("session:update", update);
        io.to(`user:${user_id}`).emit("session:update", update);
    }
}

module.exports = { init };
