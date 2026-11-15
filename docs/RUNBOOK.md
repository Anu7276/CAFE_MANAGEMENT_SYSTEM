# 📖 Café Emerald — Production Operations Runbook

## 1. Cloud Deployment Guide

### 1.1 Backend Deployment (Render / Railway)
1. **Create Web Service:** Connect this GitHub repository.
2. **Build & Start Commands:**
   - Root directory: `server`
   - Build Command: `npm ci --only=production`
   - Start Command: `node server.js`
3. **Environment Variables:**
   - `NODE_ENV=production`
   - `PORT=5000`
   - `MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/cafe_emerald?retryWrites=true&w=majority`
   - `REDIS_URL=rediss://default:<password>@<redis-host>:<port>`
   - `JWT_SECRET=<64-char-random-hex>`
   - `TABLE_TOKEN_SECRET=<64-char-random-hex>`
   - `CLIENT_URL=https://cafe-emerald.vercel.app`
   - `PUBLIC_URL=https://cafe-emerald.vercel.app`
4. **Health Check Path:** Set to `/ready`.

### 1.2 Frontend Deployment (Vercel)
1. **Import Project:** Select root directory `client`.
2. **Framework Preset:** Vite
3. **Build Command:** `npm run build`
4. **Output Directory:** `dist`
5. **Environment Variables:**
   - `VITE_API_URL=https://api.cafeemerald.com/api`
   - `VITE_SOCKET_URL=https://api.cafeemerald.com`

---

## 2. Database Backup & Disaster Recovery

### 2.1 Automated Atlas Backups
- In MongoDB Atlas dashboard, enable **Continuous Cloud Backups** with 7-day point-in-time restore.

### 2.2 Manual Backup via CLI (`mongodump`)
```bash
# Export compressed binary snapshot
mongodump --uri="$MONGO_URI" --archive="emerald_backup_$(date +%Y%m%d).gz" --gzip
```

### 2.3 Restore from Backup (`mongorestore`)
```bash
# Restore from compressed archive
mongorestore --uri="$MONGO_URI" --archive="emerald_backup_20261115.gz" --gzip --drop
```

---

## 3. Secret Rotation Protocol

1. **Table Token Secret (`TABLE_TOKEN_SECRET`):**
   - Note: Rotating this secret invalidates existing printed QR codes on physical tables.
   - When rotating: Print new table tents from `/admin` (Tables tab ➔ Print Sheet) before updating the environment variable.
2. **JWT Secret (`JWT_SECRET`):**
   - Rotating terminates all active staff sessions. Staff simply log back in at `/admin`.
3. **Razorpay Secrets (`RAZORPAY_KEY_SECRET` & `RAZORPAY_WEBHOOK_SECRET`):**
   - Regenerate key in Razorpay Dashboard ➔ Settings ➔ API Keys.
   - Update on Render/Railway and deploy without downtime.

---

## 4. SOP: Operating When Internet / Cloud is Down

1. **Local Wi-Fi Fallback:**
   - The café counter laptop runs Docker Compose: `docker-compose up -d`.
   - The laptop serves local Wi-Fi IP (e.g. `192.168.1.100:5173`).
   - If internet is lost, customer devices connected to café Wi-Fi continue ordering locally via local zero-config JSON store or local MongoDB container.
2. **Manual Kitchen KOTs:**
   - Thermal receipt printer connected directly via USB prints KOT tickets independently of cloud connectivity.
