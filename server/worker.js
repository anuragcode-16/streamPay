/**
 * worker.js — Pulse Pay streaming debit worker (Full MVP)
 *
 * Runs every TICK_INTERVAL_MS. For each active session:
 *  1. Compute debitPaise (integer, no floats)
 *  2. Atomic wallet debit (UPDATE...WHERE balance >= debit)
 *  3. Insert ledger row
 *  4. Insert wallet_transaction 'debit' row
 *  5. Emit session:update
 *  On insufficient funds: pause session, emit session:paused
 */
require("dotenv").config();
const db = require("./db");

const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "1000", 10);
const TICK_SECONDS = TICK_INTERVAL_MS / 1000;

let io;

function init(ioInstance) {
    io = ioInstance;
    setInterval(tick, TICK_INTERVAL_MS);
    console.log(`[Worker] Started. Tick: ${TICK_INTERVAL_MS}ms (${TICK_SECONDS}s)`);
}

async function tick() {
    let activeSessions;
    try {
        const result = await db.query(
            `SELECT s.id AS session_id, s.user_id, s.merchant_id, s.started_at,
              s.price_per_minute_paise
       FROM sessions s
       WHERE s.status = 'active'`
        );
        activeSessions = result.rows;
    } catch (err) {
        console.error("[Worker] Failed to fetch sessions:", err.message);
        return;
    }

    for (const session of activeSessions) {
        await processSession(session);
    }
}

async function processSession(session) {
    const { session_id, user_id, merchant_id, price_per_minute_paise } = session;

    // ── Compute debit in integer paise ──────────────────────────
    // pricePaisePerSec = round(pricePerMinutePaise / 60)
    // debitPaise = pricePaisePerSec * TICK_SECONDS
    const pricePaisePerSec = Math.round(price_per_minute_paise / 60);
    const debitPaise = pricePaisePerSec * TICK_SECONDS;
    if (debitPaise <= 0) return;

    const client = await db.getClient();
    try {
        await client.query("BEGIN");

        // ── Atomic wallet debit ──────────────────────────────────────
        const walletRes = await client.query(
            `UPDATE wallets
         SET balance_paise = balance_paise - $1
       WHERE user_id = $2 AND balance_paise >= $1
       RETURNING wallet_id, balance_paise`,
            [debitPaise, user_id]
        );

        if (walletRes.rowCount === 0) {
            // ── Insufficient funds: pause session ──────────────────────
            await client.query(
                "UPDATE sessions SET status='paused_low_balance' WHERE id=$1",
                [session_id]
            );
            await client.query("COMMIT");

            if (io) {
                const payload = { sessionId: session_id, reason: "insufficient_funds" };
                io.to(`merchant:${merchant_id}`).emit("session:paused", payload);
                io.to(`user:${user_id}`).emit("session:paused", payload);
            }
            return;
        }

        const { wallet_id, balance_paise: newBalance } = walletRes.rows[0];

        // ── Insert ledger row ────────────────────────────────────────
        await client.query(
            "INSERT INTO ledger (session_id, user_id, merchant_id, amount_paise, ts) VALUES ($1,$2,$3,$4,NOW())",
            [session_id, user_id, merchant_id, debitPaise]
        );

        // ── Insert wallet_transaction 'debit' row ────────────────────
        await client.query(
            `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount_paise, status, session_id, created_at)
       VALUES ($1,$2,'debit',$3,'completed',$4,NOW())`,
            [wallet_id, user_id, debitPaise, session_id]
        );

        // ── Running totals ───────────────────────────────────────────
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

        // ── Emit session:update ──────────────────────────────────────
        if (io) {
            const update = { sessionId: session_id, elapsedSec, totalDebitedPaise, walletBalancePaise: newBalance };
            io.to(`merchant:${merchant_id}`).emit("session:update", update);
            io.to(`user:${user_id}`).emit("session:update", update);
        }
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(`[Worker] Error session ${session_id}:`, err.message);
    } finally {
        client.release();
    }
}

module.exports = { init };
