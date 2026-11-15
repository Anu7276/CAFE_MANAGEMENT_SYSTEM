import http from 'k6/http';
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';

export const options = {
  scenarios: {
    cafe_lunch_rush: {
      executor: 'per-vu-iterations',
      vus: 50, // 50 tables ordering at once
      iterations: 3,
      maxDuration: '2m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<400'], // 95% of requests must complete below 400ms
    http_req_failed: ['rate<0.01']     // Less than 1% failure rate
  }
};

const BASE_URL = __ENV.API_URL || 'http://localhost:5000/api';
const TABLE_SECRET = __ENV.TABLE_TOKEN_SECRET || 'emerald_secret_fallback_key';

function getTableSig(table) {
  return crypto.hmac('sha256', TABLE_SECRET, String(table), 'hex').slice(0, 32);
}

export default function () {
  // Table 1 to 50 based on Virtual User ID
  const table = (__VU % 50) + 1;
  const sig = getTableSig(table);

  // 1. Fetch Menu items
  const menuRes = http.get(`${BASE_URL}/items`);
  check(menuRes, {
    'menu status 200': (r) => r.status === 200,
    'menu has items': (r) => r.json('data.length') > 0
  });

  const items = menuRes.json('data');
  const selectedItem = items && items.length > 0 ? items[0] : null;

  if (!selectedItem) {
    sleep(1);
    return;
  }

  // 2. Place Order from Table
  const idempKey = `k6_vu_${__VU}_iter_${__ITER}_${Date.now()}`;
  const payload = JSON.stringify({
    table: table,
    tableSig: sig,
    items: [
      {
        itemId: selectedItem._id,
        size: 'Tall',
        qty: 2,
        price: 1 // Server MUST calculate correct DB price, ignoring client 1
      }
    ],
    note: `K6 Load Test order from table ${table}`,
    paymentMethod: 'counter'
  });

  const orderParams = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempKey,
      'X-Table-Sig': sig
    }
  };

  const orderRes = http.post(`${BASE_URL}/orders`, payload, orderParams);
  check(orderRes, {
    'order created status 201': (r) => r.status === 201,
    'order has unguessable token': (r) => r.json('data.orderToken') !== undefined,
    'price is server calculated': (r) => r.json('data.subtotal') >= Number(selectedItem.price)
  });

  const orderToken = orderRes.json('data.orderToken');

  // 3. Customer Track Status
  if (orderToken) {
    const trackRes = http.get(`${BASE_URL}/orders/track/${orderToken}`);
    check(trackRes, {
      'track status 200': (r) => r.status === 200,
      'status is new': (r) => r.json('data.status') === 'new'
    });
  }

  // 4. Test Idempotent Retry of same payload
  const retryRes = http.post(`${BASE_URL}/orders`, payload, orderParams);
  check(retryRes, {
    'idempotent retry status 200': (r) => r.status === 200,
    'replay detected': (r) => r.json('isIdempotentReplay') === true
  });

  sleep(1);
}
