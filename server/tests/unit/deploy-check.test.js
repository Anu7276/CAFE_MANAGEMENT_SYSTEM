/**
 * Unit Test: Deployment Health, Version Telemetry, and Runbook Documentation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../../server');

console.log('\n=============================================');
console.log('🧪 RUNNING DEPLOY CHECK & VERSION TELEMETRY TEST SUITE');
console.log('=============================================\n');

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function run() {
  // 1. GET /api/version Endpoint
  await test('GET /api/version returns gitSha, buildTime, and runtime environment', async () => {
    const res = await request(app).get('/api/version');
    assert.strictEqual(res.statusCode, 200, 'Endpoint should return 200 OK');
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.gitSha, 'Response must include gitSha');
    assert.ok(res.body.buildTime, 'Response must include buildTime');
    assert.ok(res.body.nodeEnv, 'Response must include nodeEnv');
    assert.strictEqual(typeof res.body.uptime, 'number', 'Uptime must be a number');
  });

  // 2. Staging Checklist in DEPLOYMENT.md
  await test('docs/DEPLOYMENT.md contains complete Staging Deployment Checklist', () => {
    const deployDocPath = path.resolve(__dirname, '../../../docs/DEPLOYMENT.md');
    assert.ok(fs.existsSync(deployDocPath), 'docs/DEPLOYMENT.md must exist');
    const doc = fs.readFileSync(deployDocPath, 'utf8');

    assert.ok(doc.includes('Staging Deployment Checklist'), 'Must include Staging Checklist section');
    assert.ok(doc.includes('COOKIE_DOMAIN'), 'Must cover COOKIE_DOMAIN');
    assert.ok(doc.includes('Razorpay Webhook'), 'Must cover Razorpay Webhook');
    assert.ok(doc.includes('/api/version'), 'Must cover /api/version telemetry check');
  });

  // 3. "Before Going Live" Section in DEPLOYMENT.md
  await test('docs/DEPLOYMENT.md contains Before Going Live pre-launch runbook', () => {
    const deployDocPath = path.resolve(__dirname, '../../../docs/DEPLOYMENT.md');
    const doc = fs.readFileSync(deployDocPath, 'utf8');

    assert.ok(doc.includes('Before Going Live'), 'Must include Before Going Live section');
    assert.ok(doc.includes('MongoDB Atlas Dedicated Backup Tier (M10+)'), 'Must include Atlas M10+ tier');
    assert.ok(doc.includes('Paid Render / Railway Instance'), 'Must include paid instance to prevent cold starts');
    assert.ok(doc.includes('Razorpay Business KYC & Live Credentials'), 'Must cover Razorpay KYC and live keys');
    assert.ok(doc.includes('Replace Placeholder Business & Tax Details'), 'Must cover updating business details');
  });

  console.log('\n=============================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('=============================================\n');

  if (passed !== total) process.exit(1);
}

run();
