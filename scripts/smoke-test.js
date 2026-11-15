/**
 * Post-Deploy Automated Smoke Test Suite
 * Validates critical customer and staff user journeys against live Staging / Production deployments.
 *
 * Usage:
 *   node scripts/smoke-test.js --url https://api.yourcafe.com --email admin@cafeemerald.com --password YourPassword
 *   (or defaults to http://localhost:5000 in local development)
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const BASE_URL = getArg('url', process.env.API_URL || 'http://localhost:5000').replace(/\/$/, '');
const ADMIN_EMAIL = getArg('email', process.env.ADMIN_EMAIL || 'admin@cafeemerald.com');
const ADMIN_PASSWORD = getArg('password', process.env.ADMIN_PASSWORD || 'DevAdmin@Emerald2026');
const TABLE_SECRET = process.env.TABLE_SIGNING_SECRET || process.env.TABLE_TOKEN_SECRET || 'emerald_table_token_default_secret_key';

console.log('\n=============================================================');
console.log('🚀 CAFÉ EMERALD — POST-DEPLOY PRODUCTION SMOKE TEST');
console.log(`🌐 Target Endpoint: ${BASE_URL}`);
console.log('=============================================================\n');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(options.url || (BASE_URL + options.path));
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json, text/html',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      timeout: 10000
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          raw: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timed out after 10000ms'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function generateTableSig(table, secret) {
  return crypto.createHmac('sha256', secret).update(String(table)).digest('hex').slice(0, 32);
}

async function runSmokeTests() {
  const results = [];
  const startTime = Date.now();

  async function step(name, fn) {
    const t0 = Date.now();
    try {
      await fn();
      const elapsed = Date.now() - t0;
      console.log(`  ✓ PASS: ${name} (${elapsed}ms)`);
      results.push({ name, passed: true, elapsed });
    } catch (err) {
      const elapsed = Date.now() - t0;
      console.error(`  ❌ FAIL: ${name} (${elapsed}ms)`);
      console.error(`     Error: ${err.message}`);
      results.push({ name, passed: false, error: err.message, elapsed });
    }
  }

  let sampleItem = null;
  let createdOrder = null;
  let staffToken = null;

  // Step 1: Liveness Check (/health)
  await step('Liveness Probe: GET /health returns 200 healthy and validates env guards', async () => {
    const res = await request({ path: '/health' });
    if (res.status !== 200 || res.data?.status !== 'healthy') {
      throw new Error(`Unexpected /health response: HTTP ${res.status}`);
    }
    const isProd = res.data?.env === 'production';
    const allowProd = args.includes('--allow-prod');
    if (isProd && !allowProd) {
      throw new Error(
        'SAFETY GUARD: Server reports NODE_ENV=production. Smoke test refused without --allow-prod flag.'
      );
    }
  });

  // Step 2: Readiness Check (/ready)
  await step('Readiness Probe: GET /ready asserts database connectivity', async () => {
    const res = await request({ path: '/ready' });
    if (res.status !== 200 || res.data?.status !== 'ready') {
      throw new Error(`Service not ready: HTTP ${res.status} (${JSON.stringify(res.data)})`);
    }
  });

  // Step 3: Fetch Menu Catalog
  await step('Customer Menu: GET /api/items returns dish catalog', async () => {
    const res = await request({ path: '/api/items' });
    if (res.status !== 200 || !Array.isArray(res.data?.data) || res.data.data.length === 0) {
      throw new Error('Menu returned empty or invalid response');
    }
    sampleItem = res.data.data[0];
  });

  // Step 4: Create Customer Order (Signed Table QR + Idempotency)
  await step('Place Order: POST /api/orders creates order with DB price calculation', async () => {
    const tableNum = 3;
    const tableSig = generateTableSig(tableNum, TABLE_SECRET);
    const idempotencyKey = 'smoke_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    const orderPayload = {
      table: tableNum,
      tableSig,
      isTest: true,
      items: [
        {
          itemId: sampleItem._id,
          qty: 2,
          price: 1 // Client attempts tampered price; server must ignore
        }
      ],
      paymentMethod: 'counter',
      note: 'Automated Post-Deploy Smoke Test (isTest: true)'
    };

    const res = await request({
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
        'X-Table-Sig': tableSig
      }
    }, orderPayload);

    if (res.status !== 201 || !res.data?.data?._id) {
      throw new Error(`Order placement failed: HTTP ${res.status} - ${JSON.stringify(res.data)}`);
    }

    createdOrder = res.data.data;
    if (createdOrder.items[0].price === 1 && sampleItem.price !== 1) {
      throw new Error('SECURITY VIOLATION: Server accepted tampered client price!');
    }
  });

  // Step 5: Staff Authentication
  await step('Staff Authentication: POST /api/auth/login succeeds', async () => {
    const res = await request({
      path: '/api/auth/login',
      method: 'POST'
    }, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (res.status !== 200 || !res.data?.token) {
      throw new Error(`Admin login failed: HTTP ${res.status} - ${res.data?.message || 'Unauthorized'}`);
    }
    staffToken = res.data.token;
  });

  // Step 6: Advance State Machine (new -> preparing)
  await step('KDS State Machine: PATCH /api/orders/:id/status moves to preparing', async () => {
    const res = await request({
      path: `/api/orders/${createdOrder._id}/status`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${staffToken}`
      }
    }, {
      status: 'preparing',
      note: 'Accepted by KDS automated smoke test'
    });

    if (res.status !== 200 || res.data?.data?.status !== 'preparing') {
      throw new Error(`Status transition failed: HTTP ${res.status}`);
    }
  });

  // Step 7: Settle Payment (Mark Paid)
  await step('Cash Payment: PATCH /api/orders/:id/mark-paid marks order settled', async () => {
    const res = await request({
      path: `/api/orders/${createdOrder._id}/mark-paid`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${staffToken}`
      }
    }, {
      paymentMethod: 'cash'
    });

    if (res.status !== 200 || res.data?.data?.paymentStatus !== 'paid') {
      throw new Error(`Mark-paid failed: HTTP ${res.status}`);
    }
  });

  // Step 8: Printable Bill Generation
  await step('Thermal Bill: GET /api/orders/:id/print/bill renders 80mm invoice', async () => {
    const res = await request({
      path: `/api/orders/${createdOrder._id}/print/bill`,
      headers: {
        'Authorization': `Bearer ${staffToken}`
      }
    });

    if (res.status !== 200 || !res.raw.includes('80mm')) {
      throw new Error(`Thermal bill failed to render: HTTP ${res.status}`);
    }
  });

  // Step 9: Kitchen Order Ticket (KOT)
  await step('KOT Generation: GET /api/orders/:id/print/kot renders thermal ticket', async () => {
    const res = await request({
      path: `/api/orders/${createdOrder._id}/print/kot`,
      headers: {
        'Authorization': `Bearer ${staffToken}`
      }
    });

    if (res.status !== 200 || !res.raw.includes('KITCHEN ORDER TICKET')) {
      throw new Error(`KOT ticket failed to render: HTTP ${res.status}`);
    }
  });

  // Step 10: Cleanup Test Order
  if (createdOrder?._id) {
    await step('Cleanup: DELETE /api/orders/:id purges test order from system', async () => {
      const res = await request({
        path: `/api/orders/${createdOrder._id}`,
        method: 'DELETE',
        headers: staffToken ? { 'Authorization': `Bearer ${staffToken}` } : {}
      });

      if (res.status !== 200 || !res.data?.success) {
        throw new Error(`Failed to delete test order: HTTP ${res.status} - ${JSON.stringify(res.data)}`);
      }
    });
  }

  const totalTime = Date.now() - startTime;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log('\n=============================================================');
  console.log(`🏁 SMOKE TEST RESULTS: ${passedCount}/${results.length} PASSED (Total: ${totalTime}ms)`);
  console.log('=============================================================\n');

  if (failedCount > 0) {
    console.error('🛑 Smoke tests failed. Please inspect logs above.');
    process.exit(1);
  } else {
    console.log('✨ All production workflows verified healthy! Ready for traffic.');
    process.exit(0);
  }
}

runSmokeTests().catch(err => {
  console.error('Fatal smoke test runner error:', err.message);
  process.exit(1);
});
