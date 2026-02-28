/**
 * x402-config.js — Coinbase x402 payment configuration
 *
 * SETUP (fill in server/.env):
 *   CDP_API_KEY_NAME        = your CDP API key name
 *   CDP_API_KEY_PRIVATE_KEY = your CDP private key (multi-line → join with \n)
 *   MERCHANT_WALLET_ADDRESS = the wallet address that receives USDC
 *   X402_NETWORK            = base-sepolia   (testnet, default)
 */
require("dotenv").config();

// ─── Network & Token Constants ────────────────────────────────────────────────
// Base Sepolia testnet USDC contract
const USDC_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Base Mainnet USDC (for future production switch)
const USDC_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const NETWORK = process.env.X402_NETWORK || "base-sepolia";
const USDC_ADDRESS = NETWORK === "base-mainnet" ? USDC_MAINNET : USDC_SEPOLIA;

// The wallet address that receives USDC from customer sessions
const MERCHANT_WALLET = process.env.MERCHANT_WALLET_ADDRESS || "0x0000000000000000000000000000000000000001";

// Coinbase Facilitator URL (public — no auth needed for verify/settle)
const FACILITATOR_URL = "https://x402.org/facilitator";

// ─── Payment requirement builder ─────────────────────────────────────────────
/**
 * Returns the x402 PaymentRequirements object for a given USDC amount in cents.
 * @param {number} amountUSDC  e.g. 0.01 for 1 cent
 * @param {string} payTo       override merchant wallet (optional)
 */
function buildPaymentRequirements(amountUSDC, payTo) {
    // x402 amounts are in the token's native units (USDC = 6 decimals)
    const amountAtomic = BigInt(Math.round(amountUSDC * 1_000_000)).toString();

    return {
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: amountAtomic,
        resource: FACILITATOR_URL,
        description: "SteamPay session payment — USDC on Base Sepolia",
        mimeType: "application/json",
        payTo: payTo || MERCHANT_WALLET,
        maxTimeoutSeconds: 60,
        asset: USDC_ADDRESS,
        outputSchema: null,
        extra: null,
    };
}

/**
 * Convert paise (INR micro-unit) to USDC for display purposes.
 * 1 INR ≈ 0.012 USD. In testnet we simplify: 1 paise = 0.0001 USDC (test).
 */
function paiseToUSDC(paise) {
    return (paise * 0.0001).toFixed(6);
}

module.exports = {
    NETWORK,
    USDC_ADDRESS,
    MERCHANT_WALLET,
    FACILITATOR_URL,
    buildPaymentRequirements,
    paiseToUSDC,
};
