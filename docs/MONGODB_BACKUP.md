# 💾 Café Emerald — MongoDB Atlas Daily Backup & Recovery Procedure

This runbook outlines the backup retention policy, automated daily snapshot schedule, and disaster recovery restoration protocol for MongoDB Atlas.

---

## 📅 Backup Policy & Retention Schedule

| Backup Type | Frequency | Retention Window | Storage Location | Recovery Point Objective (RPO) |
| :--- | :--- | :--- | :--- | :--- |
| **Continuous Cloud Backup** | Real-time oplog | 7 Days (Point-in-Time) | MongoDB Atlas Cloud Storage | **< 1 minute** |
| **Daily Snapshots** | Every night at 02:00 IST | 30 Days | Atlas Cloud Storage | **< 24 hours** |
| **Weekly Snapshots** | Every Sunday night | 12 Weeks | Atlas Cloud Storage | **< 7 days** |
| **Offsite Gzip Archive** | Nightly cron job | 90 Days | Encrypted AWS S3 / Cloudflare R2 | **< 24 hours** |

---

## ☁️ Method 1: MongoDB Atlas Cloud Snapshots (Default)

MongoDB Atlas clusters (M10+) automatically manage Continuous Cloud Backups with Point-in-Time Recovery.

### Configuring Automated Backup Policy in Atlas UI:
1. Log in to [MongoDB Atlas Console](https://cloud.mongodb.com/).
2. Select cluster `CafeEmerald-Prod` ➔ Click **Backup** tab.
3. Under **Backup Policies**:
   - Enable **Point-in-Time Restore (PITR)** (granularity: 1 minute).
   - Set **Daily Snapshot** time to `20:30 UTC` (02:00 AM IST).
   - Set retention to `30 Days`.
4. Click **Save Changes**.

---

## 💻 Method 2: Automated Offsite CLI Dump (`mongodump`)

For shared tiers (M0/M2/M5) or offsite disaster recovery redundancy, use the provided automated dump script.

### 1. Manual Backup Command
```bash
# Export compressed binary archive with date stamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="cafe_emerald_backup_${TIMESTAMP}.gz"

mongodump \
  --uri="mongodb+srv://<USER>:<PASSWORD>@cluster0.xxxx.mongodb.net/cafe_emerald" \
  --archive="${BACKUP_FILE}" \
  --gzip

echo "✓ Backup created: ${BACKUP_FILE}"
```

### 2. Automated Daily Backup Shell Script
Create `/scripts/backup-atlas.sh`:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/mongodb"
mkdir -p "${BACKUP_DIR}"

DATE=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/cafe_emerald_${DATE}.archive.gz"

echo "[$(date)] Starting daily Café Emerald MongoDB backup..."
mongodump --uri="${MONGO_URI}" --archive="${FILENAME}" --gzip

echo "[$(date)] Uploading to Offsite Cloud Storage (S3 / R2)..."
# Optional: aws s3 cp "${FILENAME}" s3://cafe-emerald-backups/daily/

echo "[$(date)] Purging local backups older than 14 days..."
find "${BACKUP_DIR}" -name "cafe_emerald_*.archive.gz" -mtime +14 -exec rm {} \;

echo "[$(date)] Backup process completed successfully!"
```

---

## 🔄 Disaster Recovery: Restoration Procedure

In the event of catastrophic data corruption, accidental deletion, or ransomware:

### Step 1: Drain Incoming Traffic
1. Open the Admin Dashboard ➔ **Store Controls**.
2. Toggle **Accepting Orders** to **OFF** (`acceptingOrders: false`) to freeze new order creation during restoration.

### Step 2: Restore from Point-in-Time Snapshot (Atlas UI)
1. Go to **MongoDB Atlas** ➔ **Backup** ➔ Click **Restore**.
2. Select **Point in Time Restore**.
3. Choose the target timestamp (e.g. 5 minutes before the incident occurred).
4. Select destination: **Restore to Existing Cluster** or **Restore to New Cluster**.
5. Click **Confirm Restore** (typical restoration time: 5–12 minutes).

### Step 3: Restore from Gzip Archive (`mongorestore`)
If restoring from an offsite archive:
```bash
mongorestore \
  --uri="mongodb+srv://<USER>:<PASSWORD>@cluster0.xxxx.mongodb.net/cafe_emerald" \
  --archive="cafe_emerald_backup_20261116.gz" \
  --gzip \
  --drop
```
> **Notice:** The `--drop` flag drops existing collections before restoring to prevent duplicate key conflicts.

### Step 4: Verification & Smoke Test
Run the post-restore verification:
```bash
# 1. Verify database readiness probe
curl https://<YOUR_BACKEND_URL>/ready

# 2. Verify collection counts
mongosh "mongodb+srv://<USER>:<PASSWORD>@cluster0.xxxx.mongodb.net/cafe_emerald" --eval "
  console.log('Items count:', db.items.countDocuments());
  console.log('Orders count:', db.orders.countDocuments());
  console.log('Settings:', db.settings.findOne());
"

# 3. Unfreeze ordering in Admin Dashboard
```
