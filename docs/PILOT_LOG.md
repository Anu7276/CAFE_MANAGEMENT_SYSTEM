# 📊 Café Emerald — On-Site Pilot Operations Log & Go-Live Decision Gate

This logbook tracks live operational metrics, system stability, staff adoption, and customer feedback across the **7-Day On-Site Pilot** at Café Emerald. It concludes with the strict **Go-Live Decision Gate**.

---

## 📅 Daily Pilot Operational Log Template

Copy and paste this template block for every active day of the pilot run.

```markdown
### 📆 Day [X] — [YYYY-MM-DD]

#### 1. Shift Overview
- **Date & Day:** [e.g. 2026-11-20 (Friday)]
- **Duty Floor Manager:** [Name]
- **Kitchen Head / Barista:** [Name]
- **Operational Hours:** [e.g. 10:00 AM – 10:00 PM]

#### 2. Key Operational Metrics
| Metric | Value | Target / Benchmark | Status |
| :--- | :---: | :---: | :---: |
| **Total Orders Placed** | [ ] | ≥ 50 orders/day | [ ] Normal [ ] Low |
| **Failed / Abandoned Orders** | [ ] | ≤ 2% | [ ] OK [ ] Warning |
| **HTTP 429 Rate Limits / Table Caps** | [ ] | ≤ 1% | [ ] OK [ ] High |
| **Avg Seconds: Placed ➔ Accepted** | [ ]s | < 45 seconds | [ ] Fast [ ] Slow |
| **Network Disconnect / Reconnect Events** | [ ] | ≤ 5 / shift | [ ] Stable [ ] Unstable |
| **Total Net Sales (₹ INR)** | ₹[ ] | — | Verified |

#### 3. Staff Operational Issues
- **Kitchen KDS Handling:** [e.g. Staff accepted orders within 20s; chimes clearly audible during rush hour]
- **Thermal Printer & KOT:** [e.g. 80mm printer paper cutter worked smoothly; 1 paper roll replaced at 4 PM]
- **Counter Payments / Settle Cash:** [e.g. Cash mark-paid utilized for 18 orders without discrepancy]

#### 4. Customer Feedback & Dining Experience
- **QR Scan & Menu Loading:** [e.g. Scans on iPhone & Samsung fast; customers loved i18n Hindi toggle]
- **UPI Checkout Friction:** [e.g. Razorpay GPay / PhonePe zero dropped transactions]
- **Customer Comments:** [e.g. "Loved being able to add extra hot note directly from the phone."]

#### 5. Incident & Bug Tracking
| Bug / Incident Description | Severity (P0/P1/P2) | Root Cause | Immediate Action & Resolution |
| :--- | :---: | :--- | :--- |
| *None / Logged issue* | *P0 / P1 / P2* | *Root cause* | *Fix commit or workaround* |
```

---

## 📋 Completed Pilot Log Sample (Reference)

### 📆 Day 1 — 2026-11-18 (Wednesday)

#### 1. Shift Overview
- **Date & Day:** 2026-11-18 (Wednesday)
- **Duty Floor Manager:** R. Sharma
- **Kitchen Head / Barista:** A. Joshi
- **Operational Hours:** 11:00 AM – 9:00 PM

#### 2. Key Operational Metrics
| Metric | Value | Target / Benchmark | Status |
| :--- | :---: | :---: | :---: |
| **Total Orders Placed** | 68 | ≥ 50 orders/day | ✅ Normal |
| **Failed / Abandoned Orders** | 1 (1.4%) | ≤ 2% | ✅ OK |
| **HTTP 429 Rate Limits / Table Caps** | 0 (0%) | ≤ 1% | ✅ OK |
| **Avg Seconds: Placed ➔ Accepted** | 28s | < 45 seconds | ✅ Fast |
| **Network Disconnect / Reconnect Events** | 2 | ≤ 5 / shift | ✅ Stable |
| **Total Net Sales (₹ INR)** | ₹18,450 | — | Verified |

#### 3. Staff Operational Issues
- Tablet audio chime worked reliably across all 68 orders after initial morning screen unlock.
- Thermal printer connected via USB to counter POS printed both Customer Tax Invoices and Kitchen Order Tickets with accurate 2.5% CGST + 2.5% SGST breakdown.

#### 4. Customer Feedback & Dining Experience
- Diners at Table 4 and Table 7 placed repeat dessert orders from their seats without calling staff.
- Customers appreciated seeing their order transition live to *Preparing* within 30 seconds.

#### 5. Incident & Bug Tracking
- *No P0 or P1 incidents recorded. Minor: staff requested slightly larger table badge on KOT ticket (resolved).*

---

## 🚦 Strict Go-Live Decision Gate

Before transitioning from Pilot Staging to **Public Production Launch**, all 5 prerequisite criteria below must be officially audited and signed off by the engineering lead and café owner.

```
       [ 5-DAY PILOT WITH ZERO P0 BUGS ]
                      │
                      ▼
       [ RAZORPAY LIVE CREDENTIALS VERIFIED ]
                      │
                      ▼
       [ STATUTORY TAX & LEGAL DETAILS ON FILE ]
                      │
                      ▼
       [ AUTOMATED BACKUP & PITR RESTORE CONFIRMED ]
                      │
                      ▼
       [ 100% PHYSICAL QR ACRYLIC STANDS TESTED ]
                      │
                      ▼
               🚀 GO-LIVE APPROVAL
```

### 1. Stability Track Record
- [ ] **Zero P0 / P1 bugs for 5 consecutive operating days** during live dining service.
- [ ] **No system crash, socket server restart loop, or memory leak** observed on hosting instance.
- [ ] **Realtime status updates** consistently reached customer mobile devices within 2 seconds.

### 2. Payment Gateway Verification
- [ ] **Razorpay Merchant KYC is fully approved** (Bank Account, GSTIN, and FSSAI verified).
- [ ] **Live API keys** (`RAZORPAY_KEY_ID=rzp_live_...` and `RAZORPAY_KEY_SECRET`) configured on production server.
- [ ] **Webhook verified live** (`https://api.yourcafe.com/api/payments/webhook`) with secret match.
- [ ] **Live ₹1 counter payment test** conducted using Google Pay, PhonePe, and Card; funds settled to bank.

### 3. Statutory Legal & Business Compliance
- [ ] **Real Café Legal Trade Name** updated in Settings.
- [ ] **15-digit GSTIN** and **14-digit FSSAI License Number** verified against government certificates.
- [ ] **Physical Cafe Address & Phone Number** verified on generated thermal bills.
- [ ] **Public policy links** (`/privacy`, `/terms`, `/refunds`) live and reachable from site footer.

### 4. Database Disaster Recovery & Infrastructure
- [ ] **MongoDB Atlas cluster upgraded to M10 Dedicated Tier** with Continuous Cloud Backups (PITR).
- [ ] **Cold start elimination**: Node.js backend hosted on paid Render/Railway instance (zero free-tier sleep).
- [ ] **Uptime monitoring active** pinging `/health` every 60 seconds with SMS/email alerts.

### 5. Physical Stand Inspection
- [ ] **All acrylic QR stands (Tables 1 through N) inspected**:
  - Tested camera scan on Table 1 through N.
  - Verified each QR opens the exact matching table number with authentic HMAC signature.
  - Scratch-resistant laminated surface verified clean and free of table numbering defects.

---

### ✍️ Final Go-Live Sign-Off

| Stakeholder Role | Name | Signature | Date | Decision |
| :--- | :--- | :--- | :--- | :---: |
| **Engineering Lead** | ____________________ | ____________________ | ________ | `[ ] APPROVED` `[ ] HOLD` |
| **Floor Operations Manager** | ____________________ | ____________________ | ________ | `[ ] APPROVED` `[ ] HOLD` |
| **Café Owner / Primary Operator** | ____________________ | ____________________ | ________ | `[ ] APPROVED` `[ ] HOLD` |
