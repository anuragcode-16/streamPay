# ⚡ Steam Pay — Full MVP

> QR → Per-second wallet buffer → Razorpay settlement · Real-time · OpenStreetMap

---

## 📁 Structure

```
stream-pay/
├── src/pages/
│   ├── CustomerDashboard.tsx  ← Home (live session), Wallet, Nearby, History
│   ├── MerchantDashboard.tsx  ← Sessions, Services, Ads, QR Codes, Payments
│   ├── CameraQR.tsx           ← Camera QR scanner (html5-qrcode)
│   ├── WalletPage.tsx         ← Wallet create, top-up (Razorpay + UPI PIN demo)
│   ├── NearbyPage.tsx         ← Leaflet OSM map + nearby services
│   └── InvoicePage.tsx        ← Invoice at /invoice/:sessionId
├── src/components/
│   └── PaymentChoiceModal.tsx ← Pay via Wallet or Razorpay
├── server/
│   ├── index.js               ← All APIs + Socket.IO + webhook
│   ├── worker.js              ← Atomic wallet debit tick engine
│   ├── razorpay.js            ← Order creation + HMAC verify
│   ├── db.js                  ← pg Pool + transactions
│   ├── seed.js                ← Demo data seeder
│   └── gen-qr.js              ← CLI QR payload generator
└── supabase/migrations/
    └── pulse_pay_schema.sql   ← 10-table schema + seed data
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install                        # frontend
cd server && npm install && cd ..  # backend
```

### 2. Configure Environment

Use `env.example` in the repo root as a reference. Copy the relevant sections into:

- Frontend: create `.env` in the project root
- Backend: create `server/.env` inside the `server` folder

**Frontend `.env` (Vite)**
```bash
VITE_API_URL=http://localhost:4000
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_ANON_OR_PUBLIC_KEY
VITE_RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
```

**Backend `server/.env` (Express)**
```bash
DATABASE_URL=postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres

RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET

PORT=4000
FRONTEND_URL=http://localhost:5173
TICK_INTERVAL_MS=1000
```

### 3. Run Schema & Seed
```sql
-- In Supabase SQL Editor, paste contents of:
-- supabase/migrations/pulse_pay_schema.sql
```
```bash
cd server && node seed.js   # Creates demo merchant + customer wallet
```

### 4. Start Servers

```bash
# Terminal 1 — Backend
cd server && node index.js

# Terminal 2 — Frontend (already running)
npm run dev
```

---

## 🔗 ngrok + Webhook Setup

```bash
# 1. Install ngrok  https://ngrok.com/download
ngrok http 4000

# 2. Copy HTTPS URL e.g. https://abc123.ngrok.io

# 3. Razorpay Dashboard (Test Mode):
#    Settings → Webhooks → Add New Webhook
#    URL:    https://abc123.ngrok.io/api/webhook/razorpay
#    Events: payment.captured
#    Copy the webhook secret → add to server/.env as RAZORPAY_WEBHOOK_SECRET
```

---

## 🎯 Demo Flow (Acceptance Checklist)

| # | Step | Expected Result |
|---|------|----------------|
| 1 | Open `/customer` — go to Wallet tab | Create wallet `PPW-XXXXXXXX`, balance shows ₹100 |
| 2 | Click "Add Money" → Razorpay button | Razorpay checkout opens in browser |
| 3 | Enter `success@razorpay` as UPI VPA → pay | Webhook fires → wallet credited → balance updates live |
| 4 | Open `/nearby` | Leaflet map shows demo gym at Connaught Place |
| 5 | Click "Start Session Here" on the gym card | Session starts → appears in customer Home tab |
| 6 | Open `/merchant` (new tab) | Merchant dashboard shows live session with running timer |
| 7 | Wait 10 seconds | Both dashboards show ₹0.03–₹0.50 ticking up every second |
| 8 | Customer: click "Scan Stop QR" → Demo Stop | Stop QR processed → Payment Choice modal appears |
| 9 | Choose "Pay with Wallet" | Atomic wallet debit → session marked paid |
| 10 | OR: Choose "Pay via Razorpay" | Razorpay opens → pay `success@razorpay` → webhook → both dashboards show ✅ |
| 11 | History tab → click Invoice | Invoice page renders with JSON download |
| 12 | Merchant: Ads tab → create ad | Ad appears on customer session screen next session |

---

## 🌐 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/wallet/create` | Create wallet PPW-XXXXXXXX |
| `GET`  | `/api/wallet/:userId` | Get wallet + balance |
| `POST` | `/api/wallet/topup` | Create Razorpay order for top-up |
| `POST` | `/api/pay-wallet` | Atomic wallet settlement |
| `GET`  | `/api/wallet/transactions/:userId` | Wallet history |
| `POST` | `/api/create-merchant` | Create merchant (with lat/lng) |
| `POST` | `/api/merchant/service` | Add service + generate unique QR |
| `GET`  | `/api/merchant/:id/services` | List services |
| `GET`  | `/api/nearby?lat=&lng=&radius=` | OSM + DB nearby merchants |
| `POST` | `/api/ads` | Create advertisement |
| `GET`  | `/api/ads/:merchantId` | Get active ads |
| `POST` | `/api/start-session` | Start session from QR |
| `POST` | `/api/stop-session` | Stop + compute final amount |
| `POST` | `/api/create-order` | Razorpay order for session |
| `GET`  | `/api/invoice/:sessionId` | Downloadable invoice JSON |
| `GET`  | `/api/transactions/:userId` | Full session/payment history |
| `POST` | `/api/webhook/razorpay` | HMAC-verified Razorpay events |

---

## 🔌 Socket.IO Events

Rooms: `merchant:{id}` and `user:{id}`

| Event | Payload |
|-------|---------|
| `session:start` | `{ sessionId, userId, merchantId, startedAt, pricePerMinutePaise }` |
| `session:update` | `{ sessionId, elapsedSec, totalDebitedPaise, walletBalancePaise }` |
| `session:paused` | `{ sessionId, reason }` |
| `session:stop` | `{ sessionId, durationSec, finalAmountPaise }` |
| `payment:success` | `{ sessionId, paymentId, amountPaise, method }` |
| `wallet:update` | `{ balancePaise, event, amountPaise }` |

---

## 💳 Test Payments

| Method | Value |
|--------|-------|
| UPI VPA | `success@razorpay` |
| Card | `4111 1111 1111 1111` · Any future expiry · Any CVV |
| Failure | `failure@razorpay` |

---

## 🧠 Architecture Notes

**Why wallet + worker and not per-second UPI?**
NPCI limits UPI to a few transactions per day per VPA. Instead: customer tops up wallet once via Razorpay, server worker debits the DB-only wallet every second, and one final Razorpay charge settles the session.

**Atomic debit (no race conditions):**
```sql
UPDATE wallets SET balance_paise = balance_paise - $debit
WHERE user_id = $userId AND balance_paise >= $debit
```
`rowCount = 0` → insufficient → session paused.

**All money as integer paise:** `₹2/min = 200 paise/min = 3 paise/sec`

**Webhook is authoritative:** Client UI is optimistic, server ledger + webhook confirm.

---

## 🌱 Demo Data

| Entity | ID | Details |
|--------|----|---------|
| Customer | `user_demo_customer` | Aarav Kumar · wallet PPW-DEMO0001 · ₹100 |
| Merchant | `m_demo_gym001` | PowerZone Gym · ₹2/min · Connaught Pl, Delhi |
| Service | `svc_gym_main001` | Full gym access |

---

## 📦 Stack

Frontend: React 18 · Vite · Tailwind · Framer Motion · Socket.IO client · html5-qrcode · react-leaflet · react-qr-code

Backend: Node.js · Express · Socket.IO · Razorpay SDK · pg · uuid

DB: Supabase Postgres · OpenStreetMap (Nominatim)
