/**
 * worker.js — SteamPay session timer worker (x402 edition)
 *
 * With x402 payments, wallet debits no longer happen per-second.
 * The actual USDC payment is collected atomically at session stop time
 * via x402 middleware on /api/stop-session.
 *
 * This worker now only:
 *  1. Tracks elapsed time for active sessions
 *  2. Emits session:update WebSocket ticks so both dashboards update live
 *
 * Sessions are paused only if explicitly stopped (not wallet-drained).
 */
require("dotenv").config();

const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "1000", 10);
const TICK_SECONDS = TICK_INTERVAL_MS / 1000;

let io;
let memStore;

function init(ioInstance, memStoreRef) {
    io = ioInstance;
    memStore = memStoreRef;
    setInterval(tick, TICK_INTERVAL_MS);
    console.log(`[Worker] Started (x402 mode — no per-second debits). Tick: ${TICK_INTERVAL_MS}ms`);
}

function tick() {
    if (!memStore) return;
    for (const [, session] of memStore.sessions) {
        if (session.status !== "active") continue;
        tickSession(session);
    }
}

function tickSession(session) {
    const { id: sessionId, user_id, merchant_id, price_per_minute_paise, started_at } = session;
    const elapsedSec = Math.floor((Date.now() - new Date(started_at).getTime()) / 1000);

    // Compute running cost in paise (for display only — not debited yet)
    const pricePerSec = price_per_minute_paise / 60;
    const runningCostPaise = Math.round(pricePerSec * elapsedSec);

    // Update session for dashboard hydration on reconnect
    session.running_cost_paise = runningCostPaise;
    session.elapsed_sec = elapsedSec;

    if (io) {
        const update = {
            sessionId,
            elapsedSec,
            totalDebitedPaise: runningCostPaise, // display only until stop
            walletBalancePaise: null, // no longer tracked per-tick
        };
        io.to(`merchant:${merchant_id}`).emit("session:update", update);
        io.to(`user:${user_id}`).emit("session:update", update);
    }
}

module.exports = { init };
