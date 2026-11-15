/* QR Table Ordering – zero-dependency Node.js server
 * - REST API (matches the plan's endpoints) + Server-Sent Events for real-time
 * - JSON-file database (data/db.json) -> easy to swap for MongoDB later
 * - JWT (HS256) admin auth using Node's crypto
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TOKEN_TTL = 12 * 60 * 60; // seconds

/* ---------------- tiny DB layer ---------------- */
const uid = (n = 8) => crypto.randomBytes(n).toString('hex');
const hashPass = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

function seed() {
  const salt = uid(8);
  const mk = (name, category, price, description, emoji, isVeg = true, sizes = []) => ({
    id: uid(6), name, category, price, description, image: '', emoji, isVeg,
    isAvailable: true, sizes, createdAt: new Date().toISOString(),
  });
  const SZ = [{ name: 'Tall', extra: 0 }, { name: 'Grande', extra: 30 }, { name: 'Venti', extra: 60 }];
  return {
    secret: uid(32),
    counters: { order: 1000 },
    admin: {
      username: process.env.ADMIN_USER || 'admin',
      salt,
      hash: hashPass(process.env.ADMIN_PASS || 'admin123', salt),
    },
    settings: {
      cafeName: '[YOUR CAFE]', tagline: 'Good Coffee. Good Mood.',
      taxPercent: 5, acceptingOrders: true, publicUrl: '', currency: '₹',
    },
    categories: [
      { id: 'coffee', name: 'Coffee', emoji: '☕' },
      { id: 'cold', name: 'Cold', emoji: '🧋' },
      { id: 'snacks', name: 'Snacks', emoji: '🍔' },
      { id: 'desserts', name: 'Desserts', emoji: '🧁' },
    ],
    items: [
      mk('Cappuccino', 'coffee', 180, 'Espresso with steamed milk and a thick velvety foam.', '☕'),
      mk('Latte', 'coffee', 190, 'Smooth espresso with plenty of steamed milk.', '🥛'),
      mk('Espresso', 'coffee', 130, 'A short, strong, classic shot.', '☕'),
      mk('Filter Coffee', 'coffee', 110, 'South-Indian style decoction coffee.', '☕'),
      mk('Cold Coffee', 'cold', 210, 'Iced, lightly sweet.', '🧋', true, SZ),
      mk('Iced Lemon Tea', 'cold', 160, 'Chilled black tea with fresh lemon.', '🍹'),
      mk('Mango Smoothie', 'cold', 220, 'Alphonso mango blended with yoghurt.', '🥭', true, SZ),
      mk('Veg Sandwich', 'snacks', 150, 'Grilled with cucumber, tomato, cheese and mint chutney.', '🥪'),
      mk('Chicken Burger', 'snacks', 240, 'Crispy chicken patty, lettuce and house sauce.', '🍔', false),
      mk('French Fries', 'snacks', 120, 'Salted, crispy and hot.', '🍟'),
      mk('Brownie', 'desserts', 150, 'Warm chocolate brownie with a gooey centre.', '🍫'),
      mk('Blueberry Muffin', 'desserts', 110, 'Baked fresh every morning.', '🧁'),
    ],
    tables: Array.from({ length: 8 }, (_, i) => ({ number: i + 1, label: '', active: true })),
    orders: [],
  };
}

let db;
function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  else { db = seed(); saveDb(); }
}
function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------- JWT ---------------- */
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function signJwt(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL });
  const s = crypto.createHmac('sha256', db.secret).update(h + '.' + p).digest('base64url');
  return `${h}.${p}.${s}`;
}
function verifyJwt(token) {
  try {
    const [h, p, s] = String(token).split('.');
    const exp = crypto.createHmac('sha256', db.secret).update(h + '.' + p).digest('base64url');
    const a = Buffer.from(s), b = Buffer.from(exp);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch { return null; }
}

/* ---------------- real-time (SSE) ---------------- */
const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    if (c.admin) c.res.write(msg);
    else if (type === 'items' || type === 'settings') c.res.write(msg);
    else if (type === 'order' && c.orderId && c.orderId === data.id) c.res.write(msg);
  }
}
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25000);

/* ---------------- helpers ---------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const send = (res, status, body, headers = {}) => {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isJson ? 'application/json' : 'text/plain', ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
};
function readBody(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
const publicOrder = (o) => o; // orders hold no private data
const publicSettings = () => ({
  cafeName: db.settings.cafeName, tagline: db.settings.tagline, taxPercent: db.settings.taxPercent,
  acceptingOrders: db.settings.acceptingOrders, currency: db.settings.currency,
});
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const STATUSES = ['new', 'preparing', 'ready', 'served', 'rejected'];

function parseSizes(sizes) {
  if (!Array.isArray(sizes)) return [];
  return sizes.map((s) => ({ name: str(s.name, 30), extra: Math.max(0, Number(s.extra) || 0) })).filter((s) => s.name).slice(0, 6);
}
function cleanItem(b, existing = {}) {
  const name = str(b.name ?? existing.name, 80);
  if (!name) throw new HttpError(400, 'Name is required');
  const category = str(b.category ?? existing.category, 40);
  if (!db.categories.some((c) => c.id === category)) throw new HttpError(400, 'Pick a valid category');
  const price = Number(b.price ?? existing.price);
  if (!Number.isFinite(price) || price < 0 || price > 100000) throw new HttpError(400, 'Enter a valid price');
  return {
    ...existing,
    name, category, price: Math.round(price * 100) / 100,
    description: str(b.description ?? existing.description, 400),
    image: str(b.image ?? existing.image ?? '', 300),
    emoji: str(b.emoji ?? existing.emoji ?? '', 8),
    isVeg: b.isVeg !== undefined ? !!b.isVeg : existing.isVeg !== false,
    isAvailable: b.isAvailable !== undefined ? !!b.isAvailable : existing.isAvailable !== false,
    sizes: b.sizes !== undefined ? parseSizes(b.sizes) : existing.sizes || [],
  };
}

function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/* ---------------- routes ---------------- */
const routes = [];
const route = (method, pattern, handler, admin = false) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, admin });
};

// ---- public
route('GET', '/api/settings', () => publicSettings());
route('GET', '/api/categories', () => db.categories);
route('GET', '/api/items', () => db.items);
route('GET', '/api/tables/:number', ({ params }) => {
  const t = db.tables.find((t) => String(t.number) === params.number && t.active);
  if (!t) throw new HttpError(404, 'Table not found');
  return t;
});

route('POST', '/api/orders', ({ body }) => {
  if (!db.settings.acceptingOrders) throw new HttpError(403, 'The café is not accepting orders right now.');
  const table = db.tables.find((t) => String(t.number) === String(body.table) && t.active);
  if (!table) throw new HttpError(400, 'Unknown table. Please scan the QR code on your table again.');
  if (!Array.isArray(body.items) || !body.items.length) throw new HttpError(400, 'Your cart is empty.');
  if (body.items.length > 40) throw new HttpError(400, 'Too many items.');
  const lines = body.items.map((l) => {
    const item = db.items.find((i) => i.id === l.id);
    if (!item) throw new HttpError(400, 'An item in your cart no longer exists.');
    if (!item.isAvailable) throw new HttpError(400, `${item.name} is out of stock.`);
    const qty = Math.floor(Number(l.qty));
    if (!(qty >= 1 && qty <= 20)) throw new HttpError(400, 'Invalid quantity.');
    let size = '', extra = 0;
    if (item.sizes && item.sizes.length) {
      const s = item.sizes.find((s) => s.name === l.size) || item.sizes[0];
      size = s.name; extra = s.extra;
    }
    // price is snapshotted here – later menu edits never change old bills
    return { itemId: item.id, name: item.name, size, unitPrice: item.price + extra, qty, isVeg: item.isVeg };
  });
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const taxPercent = db.settings.taxPercent;
  const tax = Math.round((subtotal * taxPercent) / 100);
  const now = new Date().toISOString();
  const order = {
    id: uid(6), number: ++db.counters.order, table: table.number,
    items: lines, note: str(body.note, 300), subtotal, taxPercent, tax, total: subtotal + tax,
    status: 'new', paymentMethod: body.paymentMethod === 'upi' ? 'upi' : 'counter', paymentStatus: 'unpaid',
    createdAt: now, history: [{ status: 'new', at: now }],
  };
  db.orders.push(order); saveDb();
  broadcast('order', order);
  return order;
});

route('GET', '/api/orders/:id', ({ params }) => {
  const o = db.orders.find((o) => o.id === params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  return publicOrder(o);
});
route('POST', '/api/orders/:id/cancel', ({ params }) => {
  const o = db.orders.find((o) => o.id === params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.status !== 'new') throw new HttpError(400, 'The café has already started on this order.');
  setStatus(o, 'rejected', 'Cancelled by customer');
  return o;
});

function setStatus(o, status, reason) {
  o.status = status;
  const h = { status, at: new Date().toISOString() };
  if (reason) h.reason = reason;
  o.history.push(h);
  saveDb(); broadcast('order', o);
}

route('POST', '/api/admin/login', async ({ body }) => {
  const a = db.admin;
  const ok = str(body.username) === a.username &&
    crypto.timingSafeEqual(Buffer.from(hashPass(String(body.password ?? ''), a.salt)), Buffer.from(a.hash));
  if (!ok) { await new Promise((r) => setTimeout(r, 600)); throw new HttpError(401, 'Wrong username or password'); }
  return { token: signJwt({ sub: a.username }), username: a.username };
});

// ---- admin: items
route('POST', '/api/admin/items', ({ body }) => {
  const item = cleanItem(body, { id: uid(6), createdAt: new Date().toISOString() });
  db.items.push(item); saveDb(); broadcast('items', {});
  return item;
}, true);
route('PUT', '/api/admin/items/:id', ({ params, body }) => {
  const i = db.items.findIndex((x) => x.id === params.id);
  if (i < 0) throw new HttpError(404, 'Item not found');
  db.items[i] = cleanItem(body, db.items[i]); saveDb(); broadcast('items', {});
  return db.items[i];
}, true);
route('PATCH', '/api/admin/items/:id/availability', ({ params, body }) => {
  const it = db.items.find((x) => x.id === params.id);
  if (!it) throw new HttpError(404, 'Item not found');
  it.isAvailable = body.isAvailable !== undefined ? !!body.isAvailable : !it.isAvailable;
  saveDb(); broadcast('items', {});
  return it;
}, true);
route('DELETE', '/api/admin/items/:id', ({ params }) => {
  const i = db.items.findIndex((x) => x.id === params.id);
  if (i < 0) throw new HttpError(404, 'Item not found');
  db.items.splice(i, 1); saveDb(); broadcast('items', {});
  return { ok: true };
}, true);

// ---- admin: categories
route('POST', '/api/admin/categories', ({ body }) => {
  const name = str(body.name, 30);
  if (!name) throw new HttpError(400, 'Category name is required');
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid(3);
  if (db.categories.some((c) => c.id === id)) throw new HttpError(400, 'That category already exists');
  const c = { id, name, emoji: str(body.emoji, 8) || '🍽️' };
  db.categories.push(c); saveDb(); broadcast('items', {});
  return c;
}, true);
route('DELETE', '/api/admin/categories/:id', ({ params }) => {
  if (db.items.some((i) => i.category === params.id)) throw new HttpError(400, 'Move or delete the items in this category first');
  db.categories = db.categories.filter((c) => c.id !== params.id); saveDb(); broadcast('items', {});
  return { ok: true };
}, true);

// ---- admin: image upload (data URL -> file in /public/uploads)
route('POST', '/api/admin/upload', ({ body }) => {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
  if (!m) throw new HttpError(400, 'Upload a PNG, JPG or WebP image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw new HttpError(413, 'Image is too large (max 4 MB)');
  const file = `${uid(8)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.mkdirSync(path.join(PUBLIC, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(PUBLIC, 'uploads', file), buf);
  return { url: '/uploads/' + file };
}, true);

// ---- admin: tables
route('GET', '/api/admin/tables', () => db.tables, true);
route('POST', '/api/admin/tables', ({ body }) => {
  const number = Math.floor(Number(body.number));
  if (!(number >= 1 && number <= 999)) throw new HttpError(400, 'Table number must be 1–999');
  if (db.tables.some((t) => t.number === number)) throw new HttpError(400, `Table ${number} already exists`);
  const t = { number, label: str(body.label, 30), active: true };
  db.tables.push(t); db.tables.sort((a, b) => a.number - b.number); saveDb();
  return t;
}, true);
route('PATCH', '/api/admin/tables/:number', ({ params, body }) => {
  const t = db.tables.find((t) => String(t.number) === params.number);
  if (!t) throw new HttpError(404, 'Table not found');
  if (body.label !== undefined) t.label = str(body.label, 30);
  if (body.active !== undefined) t.active = !!body.active;
  saveDb(); return t;
}, true);
route('DELETE', '/api/admin/tables/:number', ({ params }) => {
  db.tables = db.tables.filter((t) => String(t.number) !== params.number); saveDb();
  return { ok: true };
}, true);

// ---- admin: orders
route('GET', '/api/admin/orders', ({ query }) => {
  let list = db.orders;
  if (query.get('view') === 'live') list = list.filter((o) => ['new', 'preparing', 'ready'].includes(o.status));
  const status = query.get('status'); if (status && STATUSES.includes(status)) list = list.filter((o) => o.status === status);
  const from = query.get('from'), to = query.get('to');
  if (from) list = list.filter((o) => dayKey(o.createdAt) >= from);
  if (to) list = list.filter((o) => dayKey(o.createdAt) <= to);
  const q = str(query.get('q')).toLowerCase();
  if (q) list = list.filter((o) => String(o.number).includes(q) || `table ${o.table}`.includes(q) || o.items.some((l) => l.name.toLowerCase().includes(q)));
  return list.slice().sort((a, b) => b.number - a.number).slice(0, 500);
}, true);
route('PATCH', '/api/admin/orders/:id/status', ({ params, body }) => {
  const o = db.orders.find((o) => o.id === params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Invalid status');
  setStatus(o, body.status, body.status === 'rejected' ? str(body.reason, 120) || 'Rejected by café' : '');
  return o;
}, true);
route('PATCH', '/api/admin/orders/:id/payment', ({ params, body }) => {
  const o = db.orders.find((o) => o.id === params.id);
  if (!o) throw new HttpError(404, 'Order not found');
  o.paymentStatus = body.paymentStatus === 'paid' ? 'paid' : 'unpaid';
  if (['counter', 'upi', 'cash', 'card'].includes(body.paymentMethod)) o.paymentMethod = body.paymentMethod;
  saveDb(); broadcast('order', o);
  return o;
}, true);

// ---- admin: reports
route('GET', '/api/admin/reports', ({ query }) => {
  const days = Math.min(90, Math.max(1, parseInt(query.get('days')) || 7));
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const valid = db.orders.filter((o) => o.status !== 'rejected' && new Date(o.createdAt) >= start);
  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const k = dayKey(d);
    const os = valid.filter((o) => dayKey(o.createdAt) === k);
    daily.push({ date: k, orders: os.length, revenue: os.reduce((s, o) => s + o.total, 0) });
  }
  const top = {};
  for (const o of valid) for (const l of o.items) {
    const t = (top[l.name] ||= { name: l.name, qty: 0, revenue: 0 });
    t.qty += l.qty; t.revenue += l.qty * l.unitPrice;
  }
  const revenue = valid.reduce((s, o) => s + o.total, 0);
  const paid = valid.filter((o) => o.paymentStatus === 'paid');
  return {
    days, revenue, orders: valid.length, avgOrder: valid.length ? Math.round(revenue / valid.length) : 0,
    paidRevenue: paid.reduce((s, o) => s + o.total, 0), unpaidRevenue: valid.filter((o) => o.paymentStatus !== 'paid').reduce((s, o) => s + o.total, 0),
    cancelled: db.orders.filter((o) => o.status === 'rejected' && new Date(o.createdAt) >= start).length,
    daily, topItems: Object.values(top).sort((a, b) => b.qty - a.qty).slice(0, 8),
  };
}, true);

// ---- admin: settings
route('GET', '/api/admin/settings', () => ({ ...db.settings, username: db.admin.username }), true);
route('PUT', '/api/admin/settings', ({ body }) => {
  const s = db.settings;
  if (body.cafeName !== undefined) s.cafeName = str(body.cafeName, 60) || s.cafeName;
  if (body.tagline !== undefined) s.tagline = str(body.tagline, 80);
  if (body.taxPercent !== undefined) { const t = Number(body.taxPercent); if (!(t >= 0 && t <= 50)) throw new HttpError(400, 'Tax must be 0–50%'); s.taxPercent = t; }
  if (body.acceptingOrders !== undefined) s.acceptingOrders = !!body.acceptingOrders;
  if (body.publicUrl !== undefined) s.publicUrl = str(body.publicUrl, 200).replace(/\/+$/, '');
  saveDb(); broadcast('settings', publicSettings());
  return { ...s, username: db.admin.username };
}, true);
route('POST', '/api/admin/password', ({ body }) => {
  const a = db.admin;
  if (hashPass(String(body.current ?? ''), a.salt) !== a.hash) throw new HttpError(400, 'Current password is wrong');
  const next = String(body.next ?? '');
  if (next.length < 6) throw new HttpError(400, 'New password must be at least 6 characters');
  a.salt = uid(8); a.hash = hashPass(next, a.salt);
  db.secret = uid(32); // invalidates old tokens
  saveDb();
  return { ok: true, token: signJwt({ sub: a.username }) };
}, true);

/* ---------------- server ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';
  const file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': pathname.startsWith('/uploads/') ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const bearer = (req, query) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : query.get('token');
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const { pathname } = u;
  try {
    if (pathname === '/api/events') { // SSE
      const admin = !!verifyJwt(u.searchParams.get('token'));
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      const c = { res, admin, orderId: u.searchParams.get('order') || '' };
      clients.add(c); req.on('close', () => clients.delete(c));
      return;
    }
    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(pathname); if (!m) continue;
        if (r.admin && !verifyJwt(bearer(req, u.searchParams))) throw new HttpError(401, 'Please log in');
        const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
        const out = await r.handler({ params, body, query: u.searchParams, req });
        return send(res, 200, out ?? { ok: true });
      }
      throw new HttpError(404, 'Not found');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    serveStatic(req, res, pathname);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});

loadDb();
server.listen(PORT, () => {
  console.log(`\n  ☕ Café ordering running →  http://localhost:${PORT}/?table=1`);
  console.log(`  🔐 Admin panel            →  http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASS) console.log('  ⚠  Default login is admin / admin123 – change it in Settings.\n');
});
