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
node scripts/smoke-test.js --url https://api.cafeemerald.com --email owner@cafeemerald.com --password YourPassword
```
See below for details on the automated verification suite.
