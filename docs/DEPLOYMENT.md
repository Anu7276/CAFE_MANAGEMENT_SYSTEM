# 🚀 Café Emerald — Production & Staging Deployment Guide

This guide provides end-to-end instructions for deploying Café Emerald across **Render / Railway** (Node.js API + Redis + WebSockets), **Vercel** (React Vite PWA), and **MongoDB Atlas** (Database).

---

## 🏗️ Architecture & Environments

| Component | Staging Environment | Production Environment |
| :--- | :--- | :--- |
| **Frontend Client (SPA)** | Vercel (`staging-cafe-emerald.vercel.app`) | Vercel (`order.cafeemerald.com`) |
| **Backend API & WebSockets** | Render/Railway (`api-staging.onrender.com`) | Render/Railway (`api.cafeemerald.com`) |
| **Database** | MongoDB Atlas (`cluster-staging`) | MongoDB Atlas (`cluster-prod` M10+ with PITR) |
| **Pub/Sub Cache** | In-Memory or Upstash Redis Free | Redis 7 Instance (Dedicated) |
| **Payments Mode** | Razorpay **Test Mode** (`rzp_test_...`) | Razorpay **Live Mode** (`rzp_live_...`) |
| **Image Storage** | Local Disk or Cloudinary Staging Folder | Cloudinary Production (`cafe_emerald/items`) |

---

## 1. Deploying the Backend on Render

Render natively supports long-lived HTTP and WebSocket (`ws://` / `wss://`) connections required by Socket.IO.

### Step 1: Deploy with Render Blueprint (`render.yaml`)
1. Fork or push the repo to GitHub: `https://github.com/Anu7276/CAFE_MANAGEMENT_SYSTEM.git`.
2. Open the [Render Dashboard](https://dashboard.render.com/) ➔ Click **Blueprints** ➔ **New Blueprint Instance**.
3. Select this repository. Render automatically reads `render.yaml` and provisions:
   - Web Service: `cafe-emerald-server` (Node.js)
   - Redis Service: `cafe-emerald-redis`

### Step 2: Configure Environment Variables in Render Dashboard
Go to **Environment Variables** for `cafe-emerald-server` and populate:
```ini
NODE_ENV=production
PORT=5000
TRUST_PROXY=1
MONGO_URI=mongodb+srv://<USER>:<PASS>@cluster0.xxxx.mongodb.net/cafe_emerald?retryWrites=true&w=majority
JWT_SECRET=<AUTO_GENERATED_32_CHAR_HEX>
TABLE_SIGNING_SECRET=<AUTO_GENERATED_32_CHAR_HEX>
CLIENT_URL=https://order.cafeemerald.com
PUBLIC_URL=https://order.cafeemerald.com
COOKIE_DOMAIN=.cafeemerald.com
ADMIN_EMAIL=owner@cafeemerald.com
ADMIN_PASSWORD=<STRONG_PASSWD_MIN_8_CHARS>
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_live_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Step 3: Run Database Seed
In Render Dashboard ➔ `cafe-emerald-server` ➔ **Shell**, execute:
```bash
npm run seed
```
This initializes the primary owner account and default business settings.

---

## 2. Deploying the Backend on Railway (Alternative)

1. Open [Railway Dashboard](https://railway.app/) ➔ **New Project** ➔ **Deploy from GitHub repo**.
2. Add a **Redis** service (`New` ➔ `Database` ➔ `Redis`).
3. In the Web service **Settings**:
   - Set **Root Directory** to `/server`.
   - Set **Healthcheck Path** to `/ready`.
4. In **Variables**, add all variables from `server/.env.example`.
5. Connect `REDIS_URL` using Railway's reference variable `${{Redis.REDIS_URL}}`.

---

## 3. Deploying the Frontend Client on Vercel

1. Log in to [Vercel Dashboard](https://vercel.com/) ➔ **Add New...** ➔ **Project**.
2. Import repository `CAFE_MANAGEMENT_SYSTEM`.
3. Configure Project Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** `client`
   - **Build Command:** `vite build`
   - **Output Directory:** `dist`
4. Configure Environment Variables:
   ```ini
   VITE_API_URL=https://api.cafeemerald.com
   VITE_SENTRY_DSN=https://xxx@sentry.io/xxx
   ```
5. Click **Deploy**. Vercel will build the production SPA and deploy it globally across edge networks.

---

## 4. Razorpay Gateway Setup (Test vs Live Mode)

Café Emerald processes UPI (GPay, PhonePe, Paytm, BHIM) and credit/debit card transactions via Razorpay.

### 1. Generating API Credentials
1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/) ➔ **Settings** ➔ **API Keys**.
2. **For Staging / Testing:**
   - Toggle to **Test Mode**.
   - Generate Key: `RAZORPAY_KEY_ID` (starts with `rzp_test_...`), `RAZORPAY_KEY_SECRET`.
3. **For Production:**
   - Complete KYC and business verification.
   - Toggle to **Live Mode**.
   - Generate Key: `RAZORPAY_KEY_ID` (starts with `rzp_live_...`), `RAZORPAY_KEY_SECRET`.

### 2. Configuring the Razorpay Webhook
Webhooks notify the server instantly if a payment completes via external UPI apps.
1. In Razorpay Dashboard ➔ **Settings** ➔ **Webhooks** ➔ **Add New Webhook**.
2. **Webhook URL:**
   ```
   https://api.cafeemerald.com/api/payments/webhook
   ```
3. **Secret:** Set a secure random string and assign it to `RAZORPAY_WEBHOOK_SECRET` on your server.
4. **Active Events:**
   - `order.paid`
   - `payment.captured`
   - `payment.failed`
5. Save Webhook.

---

## 5. Post-Deploy Verification Script

Once deployed, run the included smoke test script to verify all core workflows in under 10 seconds:
```bash
node scripts/smoke-test.js --url https://api.cafeemerald.com --email owner@cafeemerald.com --password YourPassword --allow-prod
```
The smoke test checks `/health`, tests DB price calculation integrity, KDS acceptance, cash mark-paid, thermal bill printing, KOT tickets, and automatically deletes its test order post-run.

---

## 6. Staging Deployment Checklist

Before routing live customer traffic or presenting to investors, walk through this checklist on the staging environment:

- [ ] **DNS & Subdomains Setup**:
  - `order.<yourdomain>.com` points to Vercel (CNAME `cname.vercel-dns.com`).
  - `api.<yourdomain>.com` points to Render/Railway service.
- [ ] **Cookie Domain Configured**:
  - `COOKIE_DOMAIN` is set to `.<yourdomain>.com` (leading dot).
  - Verify that logging in on `order.<yourdomain>.com` transmits `SameSite=Lax` cookies with `domain=.<yourdomain>.com`.
- [ ] **CORS & CSP Allowed Origins**:
  - `CLIENT_URL` matches `https://order.<yourdomain>.com`.
  - Connect-src allows API and WebSocket origins without console CSP warnings.
- [ ] **Razorpay Webhook Endpoint**:
  - Webhook URL configured in Razorpay Dashboard: `https://api.<yourdomain>.com/api/payments/webhook`.
  - `RAZORPAY_WEBHOOK_SECRET` matches the webhook secret in the server environment.
- [ ] **Version Telemetry Verification**:
  - Curl or browse `GET https://api.<yourdomain>.com/api/version`.
  - Response must return status `200` with the deployed `gitSha`, `buildTime`, and `nodeEnv: "production"`.
- [ ] **Service Worker Update Test**:
  - Push a test commit and verify that the Kitchen tablet KDS displays the "Update Available" toast prompt.

---

## 7. 🚨 Before Going Live (Production Runbook)

Do not switch customer QR stands or activate marketing until every item in this section is completed:

### 1. MongoDB Atlas Dedicated Backup Tier (M10+)
* **Requirement**: Never run production dining rooms on free-tier Atlas (`M0` / `M2`).
* **Action**:
  1. Upgrade cluster to **M10 Dedicated** or higher in the MongoDB Atlas dashboard.
  2. Enable **Continuous Cloud Backups (PITR)** with 7-day or 35-day retention.
  3. Set up an alert policy for cluster disk space > 80% and RAM utilization > 75%.
  4. Review `docs/MONGODB_BACKUP.md` for daily snapshot export procedures.

### 2. Paid Render / Railway Instance (Eliminate Cold Starts)
* **Requirement**: Free hosting tiers spin down after 15 minutes of inactivity. When a diner scans a table QR stand, a cold start takes 40–60 seconds, resulting in abandoned orders.
* **Action**:
  1. Upgrade `cafe-emerald-server` to **Starter** ($7/mo) or **Standard** plan on Render.
  2. Ensure minimum 1 instance is continuously running (zero spin-down).
  3. Verify ping latency via UptimeRobot or BetterStack (`/health` probe every 60s).

### 3. Razorpay Business KYC & Live Credentials
* **Requirement**: Online UPI payments will fail in live mode if merchant KYC is unverified.
* **Action**:
  1. Complete merchant bank account verification, upload FSSAI license & GSTIN certificate in Razorpay Dashboard.
  2. Switch dashboard toggle from **Test Mode** to **Live Mode**.
  3. Generate Live API Keys (`RAZORPAY_KEY_ID` starting with `rzp_live_...`).
  4. Verify that public policy links are active and accessible:
     - Privacy Policy: `https://order.<yourdomain>.com/privacy`
     - Terms of Service: `https://order.<yourdomain>.com/terms`
     - Refund & Cancellation: `https://order.<yourdomain>.com/refunds`
  5. Perform one live ₹1 transaction via Google Pay / PhonePe at counter Table 1 and verify instant receipt.

### 4. Replace Placeholder Business & Tax Details
* **Requirement**: Invoices must display the legal entity name and official GST registration under Indian Law.
* **Action**:
  1. Log in to Admin Panel (`https://order.<yourdomain>.com/admin`) with owner credentials.
  2. Navigate to **Settings** tab.
  3. Replace default values with real business information:
     - **Café Name**: Your registered legal trade name.
     - **GSTIN**: 15-character statutory GST identification number.
     - **FSSAI License**: 14-digit food safety registration number.
     - **Official Address & Phone**: Physical café location and customer grievance number.
  4. Test print a customer bill: confirm that thermal invoice header and SAC 996331 match official business records.

