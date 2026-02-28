## Stream Pay – Manual Acceptance Test Script

Follow these steps end‑to‑end in Razorpay **Test Mode** to validate the full QR → per‑second buffer → settlement flow.

### 1. Prerequisites

- Backend running at `http://localhost:4000` (`cd server && node index.js`)
- Frontend running at `http://localhost:5173` (`npm run dev`)
- Supabase Postgres schema applied from `supabase/migrations/pulse_pay_schema.sql`
- Demo data seeded: `cd server && node seed.js`
- Razorpay Test Mode keys configured in `server/.env` and frontend `.env`
- ngrok tunnel for webhooks:
  - Run: `ngrok http 4000`
  - Configure Razorpay Test Webhook URL: `https://<your-ngrok>.ngrok.io/api/webhook/razorpay`
  - Event: `payment.captured`
  - Secret: matches `RAZORPAY_WEBHOOK_SECRET`

### 2. Wallet Creation & Top‑up

1. Open the frontend in a browser and sign in as (or create) a **customer** user.
2. Navigate to the **Wallet** tab (`/customer` → Wallet).
3. If no wallet exists, use the form to create one:
   - Confirm a `PPW-XXXXXXXX` wallet ID is shown with balance and display name.
4. Click **Top Up**:
   - Option A – **Razorpay Test Mode**:
     - Choose an amount (e.g., ₹100).
     - Click the Razorpay option – Checkout opens with keypad & UPI/card options.
     - Pay using test VPA `success@razorpay`.
     - After webhook fires, wallet balance increases and the **wallet history** shows a completed `topup` row.
   - Option B – **Demo UPI PIN Simulation**:
     - Choose “Demo UPI PIN Entry”.
     - Enter a 4–6 digit PIN on the simulated keypad, wait for verification.
     - Wallet balance updates for the demo and transaction list shows the credit.

### 3. Nearby Discovery (OpenStreetMap)

1. Go to the **Nearby** tab.
2. Allow browser geolocation or use the default demo coordinates (Connaught Place, New Delhi).
3. Verify:
   - Leaflet map renders tiles from OpenStreetMap.
   - Demo merchant `PowerZone Gym` appears in the list with distance, price per minute, and location.

### 4. Start Session from Nearby or QR

Option A – **Nearby CTA**:
1. On the `PowerZone Gym` card, click **Start Session Here**.
2. You are navigated to the **Customer Home** tab.

Option B – **QR Scan**:
1. Open `/scan` or **Camera QR** page.
2. Use:
   - Camera scanner to scan the Base64 QR, **or**
   - Demo buttons (“Start Demo Session”) / manual payload with the seed QR payload.
3. Either path should:
   - Call `POST /api/start-session`.
   - Emit `session:start` to both `user:{userId}` and `merchant:{merchantId}` rooms.

Verify on **Customer Dashboard**:
- Active session card shows:
  - Live timer (MM:SS).
  - Live “Cost so far” in INR.
  - Streaming badge.
- Wallet pill in sidebar shows current balance.

Verify on **Merchant Dashboard**:
- Live session appears under **Overview / Sessions** with:
  - User ID (masked).
  - Service type.
  - Elapsed time.
  - Accumulated revenue.

### 5. Per‑second Worker & Ledger

1. Let the session run for at least 10–20 seconds.
2. Confirm in the UI:
   - `session:update` events tick every second on both dashboards.
   - Wallet balance reduces in real time.
3. Optionally inspect DB:
   - `ledger` table contains one row per tick for the `session_id`.
   - `wallet_transactions` includes `debit` rows for each tick.

### 6. Stop Session & Final Amount

1. From the **Camera QR** page, trigger the **Stop Demo Session** button (or scan Stop QR).
2. Backend:
   - Calls `POST /api/stop-session`.
   - Sums all `ledger` rows for that `session_id` to compute `finalAmountPaise`.
   - Emits `session:stop` to merchant and user rooms with `{ sessionId, durationSec, finalAmountPaise }`.
3. Customer UI:
   - Active session switches to “Stopped”.
   - **Payment Choice Modal** opens showing:
     - Duration.
     - Final amount.
     - Wallet balance and whether **Pay with Wallet** is allowed.

### 7. Wallet Settlement Path

1. In the Payment Choice modal, choose **Pay with Wallet** (ensure balance ≥ final amount).
2. Backend:
   - Calls `POST /api/pay-wallet`.
   - Atomically debits wallet (`UPDATE ... WHERE balance_paise >= X`).
   - Inserts a `payments` row with method `wallet`.
   - Inserts a `merchant_payable` row.
   - Emits `payment:success` to customer and merchant rooms.
3. Verify:
   - Customer sees success toast and updated wallet balance.
   - Merchant dashboard marks session as `paid` and shows a new payment row.
   - Transaction history shows both debit ticks and the settlement payment.

### 8. Razorpay Settlement Path

1. Repeat a session; on Payment Choice modal choose **Pay via Razorpay**.
2. Backend:
   - `POST /api/create-order` creates a Razorpay order for the final amount (paise).
3. Frontend:
   - Loads `https://checkout.razorpay.com/v1/checkout.js`.
   - Opens Razorpay Checkout with:
     - Test key ID.
     - Order ID.
     - Amount.
4. Complete payment:
   - Choose UPI.
   - Use test VPA `success@razorpay`.
5. Webhook:
   - Razorpay sends `payment.captured` to `/api/webhook/razorpay` via ngrok URL.
   - Server verifies HMAC using `RAZORPAY_WEBHOOK_SECRET`.
   - On success:
     - Inserts `payments` row with method `razorpay`.
     - Marks session `payment_status = 'paid'`.
     - Credits `merchant_payable`.
     - Emits `payment:success` to customer & merchant rooms.
6. Verify:
   - Both dashboards show payment confirmation.
   - Wallet remains unchanged (since Razorpay path charges directly).

### 9. History & Invoice

1. On **Customer Dashboard**, open the **History** tab.
2. Confirm:
   - Recent sessions listed with merchant name, date/time, amount, and payment status.
   - Paid sessions have an **Invoice** button.
3. Click an invoice:
   - You are taken to `/invoice/:sessionId`.
   - Verify the invoice shows:
     - Merchant details.
     - Session timings.
     - Duration and debit tick summary.
     - Final amount.
     - Payment status & payment ID.
   - Use **Download JSON** to save the invoice file.

### 10. Merchant Ads

1. Open **Merchant Dashboard → Ads** tab.
2. Create a new advertisement with title/body.
3. Start a fresh session as a customer at that merchant.
4. Confirm:
   - Customer active-session card shows the merchant advertisement panel.
   - Nearby list also highlights the ad content for that merchant.


