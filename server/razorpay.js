/**
 * razorpay.js — Centralised Razorpay SDK wrapper
 *
 * All server-side interactions with Razorpay happen here:
 *   - createOrder()   → called when a session is stopped
 *   - verifyWebhookSignature() → called in the webhook endpoint
 *
 * The Node SDK is initialised once using env vars (never exposed to client).
 */
require("dotenv").config();
const Razorpay = require("razorpay");
const crypto = require("crypto");

// Initialise Razorpay with test keys from environment
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay order for the given session.
 * @param {number} amountPaise  - Final amount in paise (integer, never float)
 * @param {string} sessionId    - Used as receipt for reconciliation
 * @returns {Promise<object>}   - Razorpay order object with id, amount, currency
 */
async function createOrder(amountPaise, sessionId) {
    if (!Number.isInteger(amountPaise) || amountPaise < 100) {
        throw new Error(`Invalid amount: ${amountPaise} paise. Must be integer >= 100.`);
    }

    const order = await razorpay.orders.create({
        amount: amountPaise,          // paise
        currency: "INR",
        receipt: `sess_${sessionId}`, // max 40 chars
        notes: { sessionId },
    });

    console.log(`[Razorpay] Order created: ${order.id} | ₹${amountPaise / 100}`);
    return order;
}

/**
 * Verify Razorpay webhook signature.
 * IMPORTANT: req.body must be the raw Buffer (not parsed JSON).
 *
 * Razorpay signs: HMAC-SHA256( rawBody, webhookSecret )
 * and sends it as the x-razorpay-signature header.
 *
 * @param {Buffer|string} rawBody     - Raw request body bytes
 * @param {string}        signature   - Value of x-razorpay-signature header
 * @returns {boolean}                 - true if signature is valid
 */
function verifyWebhookSignature(rawBody, signature) {
    const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

    // Constant-time comparison to prevent timing attacks
    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected, "hex"),
            Buffer.from(signature, "hex")
        );
    } catch {
        return false;
    }
}

module.exports = { razorpay, createOrder, verifyWebhookSignature };
