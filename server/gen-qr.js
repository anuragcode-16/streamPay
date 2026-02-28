/**
 * gen-qr.js — Generate Base64 QR payloads for any merchant
 *
 * Usage:
 *   node gen-qr.js m_demo_gym001 gym
 *   node gen-qr.js <merchantId> <serviceType>
 *
 * Output: scan URLs you can paste into the frontend Scan page.
 */
const [, , merchantId, serviceType] = process.argv;

if (!merchantId || !serviceType) {
    console.error("Usage: node gen-qr.js <merchantId> <serviceType>");
    console.error("       node gen-qr.js m_demo_gym001 gym");
    process.exit(1);
}

const startQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "start" })).toString("base64");
const stopQR = Buffer.from(JSON.stringify({ merchantId, serviceType, action: "stop" })).toString("base64");

console.log("\n📱 QR Payloads for", merchantId);
console.log("──────────────────────────────────────────────────────");
console.log("Start payload (JSON):", JSON.stringify({ merchantId, serviceType, action: "start" }));
console.log("Start base64:", startQR);
console.log("Start URL:   /scan?payload=" + startQR);
console.log("");
console.log("Stop payload (JSON):", JSON.stringify({ merchantId, serviceType, action: "stop" }));
console.log("Stop base64:", stopQR);
console.log("Stop URL:    /scan?payload=" + stopQR);
console.log("");
