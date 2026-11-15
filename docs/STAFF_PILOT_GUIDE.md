# 📋 Café Emerald — One-Page Staff & Kitchen KDS Pilot Guide

> **Quick Reference Guide for Kitchen Staff, Floor Waiters, and Cashiers**  
> *Print this page and pin it next to the kitchen tablet and billing counter.*

---

## ☕ 1. Shift Start & System Login

1. On the kitchen tablet / cashier iPad, open Chrome or Safari:  
   👉 **URL:** `https://order.cafeemerald.com/admin` (or local kiosk address)
2. Enter your assigned staff email and password.
3. Check the **top-right header**:
   - 🟢 **Live Sync (Connected)**: WebSocket is active. Tickets will arrive in real time.
   - 🔊 **Sound Enabled**: Ensure tablet volume is set to **70%+**. A 2-tone chime (D5 ➔ A5) sounds on every incoming ticket.

---

## 🍳 2. Order Lifecycle on the Kitchen KDS

Every order moves through 4 simple steps:

```
[ NEW (Orange) ]  ──▶  [ PREPARING (Blue) ]  ──▶  [ READY (Green) ]  ──▶  [ SERVED (Delivered) ]
 (Customer scans & taps)     (Kitchen starts cooking)     (Plates placed on pass)      (Delivered to table)
```

| Order State | Action Required | Staff Action | Customer Phone Status |
| :--- | :--- | :--- | :--- |
| **NEW (Orange)** | Kitchen accepts ticket | Tap **"Start Preparing"** | *"Order Received"* |
| **PREPARING (Blue)**| Cooking in progress | Prepare items on ticket | *"Kitchen is preparing your order"* |
| **READY (Green)** | Food ready on the counter | Tap **"Mark Ready"** | *"Your order is ready to collect / be served"* |
| **SERVED (Delivered)**| Food placed at table | Tap **"Mark Served"** | *"Order complete. Enjoy your meal!"* |

---

## 💵 3. Managing Payments & Cash Settle

- **Customer Paid via Phone (UPI / GPay / Card):**
  - The ticket badge automatically turns **🟢 PAID (UPI)**. No action needed!
- **Customer Paying Cash at Counter:**
  - Customer approaches counter with their **Order #** or **Table #**.
  - Collect exact cash.
  - On KDS, tap **"Mark Paid"** ➔ Select **Cash**.
  - Customer phone immediately updates to *"✓ Payment Settled"*.
- **Printing Thermal Bills:**
  - Click **"Print Bill"** for 80mm customer GST tax invoice.
  - Click **"Print KOT"** to print kitchen duplicate ticket.

---

## 🚫 4. How to Handle Sold-Out Dishes (86-ing)

If a dish runs out (e.g. croissants or mango smoothie sold out):
1. In the top bar, click the **"Menu Items"** tab.
2. Locate the dish using the search bar.
3. Tap the green **"Available"** toggle ➔ It flips to red **"Sold Out"**.
4. **Immediate Effect:** The item is disabled across all customer phones instantly. Customers cannot add it to cart.
5. When restocked tomorrow, tap the toggle again to re-enable it.

---

## 🚨 5. Emergency Protocol: What to Do If Internet Is Down

If the café WiFi disconnects or broadband internet drops:

```
[ 🔴 RECONNECTING ]
1. Check Router  ──▶  2. Switch to Hotspot  ──▶  3. Paper KOT Fallback  ──▶  4. Auto-Sync Reconnect
```

1. **Observe the KDS Badge:**
   - The top header will display 🔴 **"Reconnecting... Polling every 8s"**.
   - The system automatically falls back to HTTP polling.
2. **Switch to 4G/5G Hotspot Backup:**
   - On the kitchen tablet, open Settings ➔ Connect to **`Emerald-Backup-Hotspot`** phone.
3. **If All Internet is Completely Offline:**
   - Do **NOT** panic — customer carts and active tables remain saved on devices.
   - Pull out physical **Paper KOT Pads** from the counter drawer.
   - Waiters take manual order: Write Table Number, Item Names, and Quantities.
   - Hand the paper ticket directly to the kitchen chef.
   - Collect cash or use standalone physical card EDC swipe machine.
4. **When Internet Restores:**
   - Tablet will reconnect automatically (🟢 **Live Sync**).
   - All pending orders synchronize with the database without duplicate charges.

---

## 📞 Support & Escalation Contacts

- **Café Manager On-Duty:** `+91 98765 43210`
- **Technical Lead / DevOps:** `admin@cafeemerald.com`
- **Emergency Store Pause:** Go to **Store Controls** ➔ Click **"Freeze / Pause Orders"** to temporarily lock ordering during kitchen emergencies.
