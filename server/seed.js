/**
 * seed.js — Stream Pay Full MVP Seed Script
 *
 * Creates:
 *  - Demo customer (user_demo_customer) with PPW-DEMO0001 wallet (₹100)
 *  - Demo merchant (m_demo_gym001) — PowerZone Gym, ₹2/min, Connaught Pl
 *  - Merchant service + sample advertisement
 *  - Prints start/stop QR Base64 payloads
 *
 * Usage:  node seed.js
 */
require("dotenv").config();
const db = require("./db");

async function seed() {
  console.log("🌱 Seeding Stream Pay demo data…\n");

  try {
    // ── Users ─────────────────────────────────────────────────────────────
    await db.query(`
      INSERT INTO users (id, name, email, role) VALUES
        ('user_demo_customer', 'Aarav Kumar',  'customer@STREAMPAY.test', 'customer'),
        ('user_demo_merchant', 'Riya Sharma',  'merchant@STREAMPAY.test', 'merchant')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log("✅ Users seeded");

    // ── Merchant ──────────────────────────────────────────────────────────
    await db.query(`
      INSERT INTO merchants (id, name, service_type, price_per_minute_paise, location, lat, lng, user_id)
      VALUES ('m_demo_gym001', 'PowerZone Gym', 'gym', 200, 'Connaught Place, New Delhi', 28.6328, 77.2197, 'user_demo_merchant')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log("✅ Merchant: m_demo_gym001 (PowerZone Gym, ₹2/min)");

    // ── Merchant service ──────────────────────────────────────────────────
    await db.query(`
      INSERT INTO merchant_services (id, merchant_id, service_type, price_per_minute_paise, description)
      VALUES ('svc_gym_main001', 'm_demo_gym001', 'gym', 200, 'Full gym access — treadmill, weights, cardio')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log("✅ Service: svc_gym_main001");

    // ── Customer wallet (₹100 = 10000 paise) ─────────────────────────────
    await db.query(`
      INSERT INTO wallets (wallet_id, user_id, display_name, balance_paise)
      VALUES ('PPW-DEMO0001', 'user_demo_customer', 'Aarav Kumar', 10000)
      ON CONFLICT (wallet_id) DO UPDATE SET balance_paise = 10000
    `);
    console.log("✅ Wallet: PPW-DEMO0001 (₹100)");

    // ── Sample advertisement ──────────────────────────────────────────────
    await db.query(`
      INSERT INTO advertisements (id, merchant_id, title, body, image_url)
      VALUES (gen_random_uuid(), 'm_demo_gym001', '🏋️ New Year Offer!', '50% off on monthly membership. Show this at reception.', '')
      ON CONFLICT DO NOTHING
    `);
    console.log("✅ Advertisement seeded");

    // ── Print QR payloads ─────────────────────────────────────────────────
    const merchantId = "m_demo_gym001";
    const serviceType = "gym";

    const startPayload = { merchantId, merchantServiceId: "svc_gym_main001", serviceType, action: "start" };
    const stopPayload = { merchantId, merchantServiceId: "svc_gym_main001", serviceType, action: "stop" };
    const startQR = Buffer.from(JSON.stringify(startPayload)).toString("base64");
    const stopQR = Buffer.from(JSON.stringify(stopPayload)).toString("base64");

    console.log("\n📱 QR Payloads for demo:\n");
    console.log("START QR (Base64):");
    console.log("  " + startQR);
    console.log("\n  Scan URL: /scan?payload=" + startQR);
    console.log("\nSTOP QR (Base64):");
    console.log("  " + stopQR);
    console.log("\n  Scan URL: /scan?payload=" + stopQR);
    console.log("\n🎉 Seeding complete! Ready to demo.");
    console.log("\nDemo credentials:");
    console.log("  Customer: customer@STREAMPAY.test | Wallet: PPW-DEMO0001 | Balance: ₹100");
    console.log("  Merchant: merchant@STREAMPAY.test | ID: m_demo_gym001");
  } catch (err) {
    console.error("❌ Seed error:", err.message);
    console.error("  Make sure DATABASE_URL is set in server/.env and schema has been run.");
  } finally {
    await db.pool.end();
  }
}

seed();
