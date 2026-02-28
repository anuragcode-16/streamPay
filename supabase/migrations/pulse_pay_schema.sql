-- ============================================================
-- Pulse Pay FULL MVP Schema
-- Run in Supabase SQL Editor or psql
-- ============================================================

-- Clean slate (dev only — comment in prod)
DROP TABLE IF EXISTS merchant_payable CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS ledger CASCADE;
DROP TABLE IF EXISTS advertisements CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS merchant_services CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS wallet_transactions CASCADE;
DROP TABLE IF EXISTS merchants CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ── users ─────────────────────────────────────────────────────
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  role       TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','merchant')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── merchants ──────────────────────────────────────────────────
CREATE TABLE merchants (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  service_type           TEXT NOT NULL CHECK (service_type IN ('gym','ev','parking','coworking','wifi','spa','vending')),
  price_per_minute_paise INT  NOT NULL DEFAULT 200,
  location               TEXT DEFAULT '',
  lat                    NUMERIC(10,7),
  lng                    NUMERIC(10,7),
  user_id                TEXT REFERENCES users(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── merchant_services ──────────────────────────────────────────
-- Fine-grained services per merchant (e.g., gym has "treadmill", "weights")
CREATE TABLE merchant_services (
  id                     TEXT PRIMARY KEY,
  merchant_id            TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  service_type           TEXT NOT NULL,
  price_per_minute_paise INT  NOT NULL DEFAULT 200,
  description            TEXT DEFAULT '',
  active                 BOOLEAN DEFAULT TRUE,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── wallets ────────────────────────────────────────────────────
CREATE TABLE wallets (
  wallet_id     TEXT PRIMARY KEY,          -- PPW-XXXXXXXX
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  balance_paise INT  NOT NULL DEFAULT 0 CHECK (balance_paise >= 0),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── wallet_transactions ────────────────────────────────────────
CREATE TABLE wallet_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id          TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('topup','debit','payment','refund')),
  amount_paise       INT  NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  razorpay_order_id  TEXT,
  payment_id         TEXT,
  session_id         UUID,
  note               TEXT DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wt_user ON wallet_transactions(user_id);
CREATE INDEX idx_wt_wallet ON wallet_transactions(wallet_id);

-- ── sessions ───────────────────────────────────────────────────
CREATE TABLE sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL REFERENCES users(id),
  merchant_id          TEXT NOT NULL REFERENCES merchants(id),
  merchant_service_id  TEXT REFERENCES merchant_services(id),
  service_type         TEXT NOT NULL,
  price_per_minute_paise INT NOT NULL DEFAULT 200,
  started_at           TIMESTAMPTZ DEFAULT NOW(),
  ended_at             TIMESTAMPTZ,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','paused_low_balance','stopped')),
  final_amount_paise   INT  DEFAULT 0,
  payment_status       TEXT NOT NULL DEFAULT 'pending'
                         CHECK (payment_status IN ('pending','paid','failed')),
  razorpay_order_id    TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user   ON sessions(user_id, status);
CREATE INDEX idx_sessions_merch  ON sessions(merchant_id);
CREATE INDEX idx_sessions_order  ON sessions(razorpay_order_id);

-- ── ledger ─────────────────────────────────────────────────────
CREATE TABLE ledger (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES sessions(id),
  user_id      TEXT NOT NULL,
  merchant_id  TEXT NOT NULL,
  amount_paise INT  NOT NULL,
  ts           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ledger_session ON ledger(session_id);
CREATE INDEX idx_ledger_user    ON ledger(user_id);

-- ── payments ───────────────────────────────────────────────────
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT,
  merchant_id  TEXT,
  session_id   UUID REFERENCES sessions(id),
  order_id     TEXT,
  payment_id   TEXT NOT NULL UNIQUE,
  amount_paise INT  NOT NULL,
  status       TEXT NOT NULL DEFAULT 'paid',
  method       TEXT DEFAULT 'razorpay' CHECK (method IN ('razorpay','wallet','topup')),
  raw_payload  JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── merchant_payable ───────────────────────────────────────────
CREATE TABLE merchant_payable (
  id           BIGSERIAL PRIMARY KEY,
  merchant_id  TEXT NOT NULL REFERENCES merchants(id),
  session_id   UUID,
  amount_paise INT  NOT NULL,
  payment_id   TEXT NOT NULL UNIQUE,
  credited_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── advertisements ─────────────────────────────────────────────
CREATE TABLE advertisements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT DEFAULT '',
  image_url   TEXT DEFAULT '',
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED DATA
-- ============================================================
INSERT INTO users (id, name, email, role) VALUES
  ('user_demo_customer', 'Aarav Kumar',    'customer@pulsepay.test', 'customer'),
  ('user_demo_merchant', 'Riya Sharma',    'merchant@pulsepay.test', 'merchant')
ON CONFLICT (id) DO NOTHING;

-- Merchant: gym in Connaught Place, New Delhi (lat/lng for OSM demo)
INSERT INTO merchants (id, name, service_type, price_per_minute_paise, location, lat, lng, user_id) VALUES
  ('m_demo_gym001', 'PowerZone Gym', 'gym', 200, 'Connaught Place, New Delhi', 28.6328, 77.2197, 'user_demo_merchant')
ON CONFLICT (id) DO NOTHING;

-- Default service for the gym
INSERT INTO merchant_services (id, merchant_id, service_type, price_per_minute_paise, description) VALUES
  ('svc_gym_main001', 'm_demo_gym001', 'gym', 200, 'Full gym access — treadmill, weights, cardio')
ON CONFLICT (id) DO NOTHING;

-- Demo customer wallet: ₹100 = 10000 paise
INSERT INTO wallets (wallet_id, user_id, display_name, balance_paise) VALUES
  ('PPW-DEMO0001', 'user_demo_customer', 'Aarav Kumar', 10000)
ON CONFLICT (wallet_id) DO UPDATE SET balance_paise = 10000;

-- Sample advertisement
INSERT INTO advertisements (id, merchant_id, title, body, image_url) VALUES
  (gen_random_uuid(), 'm_demo_gym001', '🏋️ New Year Offer!', '50% off on monthly membership. Show this to reception.', '')
ON CONFLICT DO NOTHING;
