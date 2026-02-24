/**
 * db.js — PostgreSQL connection pool
 * Uses pg.Pool so all queries share connections efficiently.
 * DATABASE_URL must be set in .env (Supabase or local Postgres URI).
 */
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase requires SSL; comment out if running local Postgres without SSL
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("supabase")
        ? { rejectUnauthorized: false }
        : false,
});

pool.on("error", (err) => {
    console.error("[DB] Unexpected error on idle client", err);
});

/**
 * Execute a query. Returns { rows }.
 * @param {string} text - SQL query
 * @param {any[]} params - Parameterized values
 */
async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL) {
        console.log("[SQL]", { text, duration, rows: res.rowCount });
    }
    return res;
}

/**
 * Get a client for manual transaction control (BEGIN/COMMIT/ROLLBACK).
 */
async function getClient() {
    return pool.connect();
}

module.exports = { query, getClient, pool };
