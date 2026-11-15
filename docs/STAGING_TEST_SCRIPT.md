# 🧪 Café Emerald — Staging Manual Test Script & Verification Matrix

This document provides a numbered, end-to-end manual testing runbook for validating the **Café Emerald Staging Environment** prior to customer rollout. Every scenario has explicit preconditions, user actions, expected outcomes, and audit checkboxes.

---

## 📋 Test Session Metadata

- **Environment:** Staging (`order.staging.yourcafe.com` / `api.staging.yourcafe.com`)
- **Tester Name:** _______________________
- **Date & Time:** _______________________
- **Device Tested:** [ ] iPhone (iOS Safari) [ ] Android (Chrome) [ ] iPad / Tablet (KDS)
- **Network Tested:** [ ] 4G/5G Cellular Data [ ] Guest WiFi

---

## 🧪 Numbered Test Scenarios

### Section 1: QR Token Security, Tamper Proofing & Table Limits

| # | Test Scenario | Execution Steps | Expected Result | Result |
| :-: | :--- | :--- | :--- | :-: |
| **01** | **Scan Signed QR on Mobile Data** | Scan physical acrylic QR for Table 3 using native phone camera on 4G/5G mobile network. | Opens `https://order.staging.yourcafe.com/t/3?sig=...`. Table 3 is automatically detected and stored in session. Menu displays instantly with zero security warnings. | `[ ] PASS`<br/>`[ ] FAIL` |
| **02** | **Invalid / Tampered Table Signature** | Manually modify URL query parameter to `?sig=invalid_tampered_hash_123` or change table to `/t/4?sig=<Table3Sig>`. | Server rejects order with HTTP 403 `Security verification failed: Invalid or missing signed table token. Please re-scan QR code.` | `[ ] PASS`<br/>`[ ] FAIL` |
| **03** | **Table Open Order Cap (QR Abuse)** | Configure `maxOpenOrdersPerTable: 3` in Admin Settings. Place 3 orders on Table 3. Attempt placing a 4th order. | 4th submission is rejected with HTTP 429: *"Table 3 has reached the maximum allowed limit of 3 open orders. Please wait for current orders to be served."* | `[ ] PASS`<br/>`[ ] FAIL` |
| **04** | **Master Accepting-Orders Switch Off** | In Admin Dashboard ➔ toggle **Accepting Orders** to **Paused** (`false`). Attempt placing an order on mobile phone. | Screen immediately shows banner *"The café is currently paused and not accepting new orders."* Order placement returns HTTP 403. | `[ ] PASS`<br/>`[ ] FAIL` |

---

### Section 2: Catalog, i18n, Dish Options & Cart Interactions

| # | Test Scenario | Execution Steps | Expected Result | Result |
| :-: | :--- | :--- | :--- | :-: |
| **05** | **Multi-Language (English / Hindi / Gujarati)** | Tap language dropdown in header. Select **हिन्दी (Hindi)**, then **ગુજરાતી (Gujarati)**, then **English**. | Entire interface (categories, search, checkout buttons, status badges) updates instantly with zero page reload. Selected preference persists across refreshes. | `[ ] PASS`<br/>`[ ] FAIL` |
| **06** | **Size Variant Selection** | Open **Cappuccino** or **Cold Coffee** card modal. Select **Grande (+₹30)** or **Venti (+₹60)**. | Modal displays correct price calculation. Adding to cart reflects the chosen size badge and exact modified price. | `[ ] PASS`<br/>`[ ] FAIL` |
| **07** | **Kitchen Preparation Note** | Add items to cart. Open Cart Drawer and enter note: *"Extra hot, oat milk please"*. Click checkout. | Order payload transmits note. Admin KDS and printed Kitchen Order Ticket (KOT) clearly display the barista instruction. | `[ ] PASS`<br/>`[ ] FAIL` |
| **08** | **Sold-Out Toggle Live Sync** | On staff KDS tablet, toggle **Sold Out** on *Blueberry Cheesecake*. Observe customer phone on Table 3. | Within 2 seconds (via WebSocket `item:updated`), the card updates to *"Sold Out"* badge and *Add to Cart* button is disabled without manual refresh. | `[ ] PASS`<br/>`[ ] FAIL` |

---

### Section 3: Payments, Invoicing & Financial Continuity

| # | Test Scenario | Execution Steps | Expected Result | Result |
| :-: | :--- | :--- | :--- | :-: |
| **09** | **Razorpay UPI Test Mode: Success** | Select **Pay via UPI** at checkout. In Razorpay modal, select **Success Simulation** or UPI ID. | Payment is authorized, signature verified via HMAC-SHA256, customer tracker updates to *"Order Confirmed"*, order status sets to `new`, and payment status sets to `paid`. | `[ ] PASS`<br/>`[ ] FAIL` |
| **10** | **Razorpay UPI Test Mode: Failure / Cancel** | Select **Pay via UPI**. In Razorpay checkout modal, tap **Failure Simulation** or dismiss modal. | Application remains on checkout screen. Clear error banner explains payment was not completed; items remain safely in cart. | `[ ] PASS`<br/>`[ ] FAIL` |
| **11** | **Cash Counter Order & Mark-Paid** | Select **Pay at Counter (Cash)** and submit order. Staff opens KDS and clicks **Mark Paid**. | Order transitions to `paymentStatus: 'paid'`. Customer tracker live pushes payment confirmation. Paid timestamp and staff audit log are recorded. | `[ ] PASS`<br/>`[ ] FAIL` |
| **12** | **GST Invoice Number Continuity** | 1. Note last invoice number (e.g. `CE/2026-27/000010`).<br/>2. Run automated smoke test: `node scripts/smoke-test.js`.<br/>3. Place a new real customer order. | Smoke test orders carry `isTest: true` and temporary tags. The new customer order gets strictly consecutive `CE/2026-27/000011` with zero skipped numbers. | `[ ] PASS`<br/>`[ ] FAIL` |
| **13** | **80mm Thermal Bill & KOT Print** | On KDS, click **Print Bill** (`/print/bill`) and **Print KOT** (`/print/kot`). Connect 80mm thermal printer. | Bill formats to exact 80mm roll, containing GSTIN, FSSAI, SAC 996331, 2.5% CGST + 2.5% SGST split, and legal invoice sequence. KOT prints large table number and notes. | `[ ] PASS`<br/>`[ ] FAIL` |

---

### Section 4: Realtime Reliability, Audio & Network Resilience

| # | Test Scenario | Execution Steps | Expected Result | Result |
| :-: | :--- | :--- | :--- | :-: |
| **14** | **Kitchen State Machine & Live Tracking** | Advance order status on KDS: `new` ➔ `preparing` ➔ `ready` ➔ `served`. Watch customer tracker phone. | Customer tracker screen animates through state transitions in real time without polling delay. Illegal jumps (e.g. `new` ➔ `served`) are blocked with HTTP 400. | `[ ] PASS`<br/>`[ ] FAIL` |
| **15** | **Audio Chime on Incoming Order** | Kitchen staff taps anywhere on KDS tablet to unlock Web Audio API. Place an order from phone. | Dual-tone melodic chime (587.33 Hz ➔ 880.00 Hz) sounds cleanly from tablet speaker alerting kitchen staff of incoming order. | `[ ] PASS`<br/>`[ ] FAIL` |
| **16** | **Airplane Mode Outage & Auto-Reconnect** | 1. Place order on phone.<br/>2. Toggle phone into **Airplane Mode** for 30 seconds.<br/>3. Staff advances order to `ready`.<br/>4. Disable Airplane Mode. | Customer tracker detects network restore, triggers automated `onReconnect` sync, and immediately displays `ready` status without page reload. | `[ ] PASS`<br/>`[ ] FAIL` |
| **17** | **Dual Polling Fallback** | In DevTools, block WebSocket transport (`wss://`) or simulate strict corporate firewall blocking WebSockets. | Socket.IO smoothly degrades to HTTP long-polling and 8-second background polling fallback; order updates continue arriving reliably. | `[ ] PASS`<br/>`[ ] FAIL` |

---

### Section 5: PWA, Subdomain Cookies & Observability

| # | Test Scenario | Execution Steps | Expected Result | Result |
| :-: | :--- | :--- | :--- | :-: |
| **18** | **Sibling Subdomain Admin Login & Cookies** | Navigate to `order.staging.yourcafe.com/admin`. Log in with staff credentials. Inspect DevTools Cookies. | Cookie `emerald_token` is set with `domain: .staging.yourcafe.com`, `SameSite: Lax`, `HttpOnly: true`, and `Secure: true`. API requests to `api.staging.yourcafe.com` succeed. | `[ ] PASS`<br/>`[ ] FAIL` |
| **19** | **PWA Installation on Kitchen Tablet** | Open Chrome/Safari on iPad/Android tablet. Tap **Add to Home Screen** / **Install App**. | App installs as standalone fullscreen PWA with emerald icon (`#071a12`), standalone window, and persistent offline shell caching. | `[ ] PASS`<br/>`[ ] FAIL` |
| **20** | **Automated PWA Update Prompt on Redeploy** | Trigger a new build deployment on staging. Observe active open kitchen tablet display. | Service worker detects byte-difference in `dist/sw.js` (new build hash). Toast banner appears: *"Update available! Tap to reload kitchen display"*. | `[ ] PASS`<br/>`[ ] FAIL` |
| **21** | **Sentry Error Telemetry Trigger** | Trigger an intentional test uncaught exception or visit an invalid order token route. | Error is captured by Sentry with breadcrumbs, environment tagged as `staging`, and zero stack traces leaked to client response. | `[ ] PASS`<br/>`[ ] FAIL` |
| **22** | **Readiness & Version Telemetry Check** | Curl or inspect in browser:<br/>1. `GET /ready`<br/>2. `GET /api/version` | - `/ready` returns HTTP 200 `{ status: "ready", database: "connected" }`.<br/>- `/api/version` returns `{ success: true, gitSha: "...", buildTime: "...", nodeEnv: "production" }`. | `[ ] PASS`<br/>`[ ] FAIL` |

---

## ✍️ Verification Sign-off

- **Total Test Cases:** 22
- **Passed:** _____ / 22
- **Failed:** _____ / 22
- **Lead QA Signature:** __________________________________
- **Date Signed:** __________________
- **Staging Verdict:** [ ] PASSED FOR PILOT RUN [ ] REJECTED (BLOCKING BUGS LOGGED)
