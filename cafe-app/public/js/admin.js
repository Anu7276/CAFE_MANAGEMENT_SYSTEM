/* Admin panel – live orders, menu management, tables & QR, reports, history, settings */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = localStorage.getItem('adminToken') || '';

async function api(path, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) {
    logout();
    throw new Error('Session expired');
  }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}

function toast(msg, err) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 2800);
}

const guard = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    toast(e.message, true);
  }
};

const A = {
  view: 'live',
  settings: {},
  items: [],
  cats: [],
  tables: [],
  live: [],
  fresh: new Set(),
  connected: false,
  filters: { q: '', cat: '' },
  hist: { from: '', to: '', status: '', q: '' },
  days: 7,
  colTab: 'all', // For mobile: 'all' | 'new' | 'preparing' | 'ready'
};

const money = (n) => (A.settings.currency || '₹') + Number(n).toLocaleString('en-IN');
const NAV = [
  ['live', '📊', 'Live orders'],
  ['items', '🍴', 'Menu items'],
  ['tables', '▦', 'Tables & QR'],
  ['reports', '📈', 'Reports'],
  ['history', '🧾', 'Order history'],
  ['settings', '⚙️', 'Settings'],
];

const timeAgo = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const fmtDT = (iso) => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const LOGO_SVG = `<svg class="logo" viewBox="0 0 64 64" fill="none" stroke="#1b4d36" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 10c-3 3 3 5 0 8M27 8c-3 3 3 5 0 10M36 10c-3 3 3 5 0 8"/>
  <path d="M8 28h38v10a14 14 0 0 1-14 14h-10A14 14 0 0 1 8 38z"/>
  <path d="M46 31h4a6 6 0 0 1 0 14h-6"/>
  <path d="M6 58h46"/>
</svg>`;

/* ---------- login ---------- */
function showLogin() {
  $('#root').innerHTML = `
    <div class="login">
      <form id="lf">
        <h1>☕ Café Admin</h1>
        <p>Log in to manage orders, menu, and live kitchen status.</p>
        <label class="field">
          <span>Username</span>
          <input name="u" autocomplete="username" required autofocus placeholder="admin">
        </label>
        <label class="field">
          <span>Password</span>
          <input name="p" type="password" autocomplete="current-password" required placeholder="admin123">
        </label>
        <div class="err" id="le"></div>
        <button class="btn primary block">Log In</button>
        <div class="hint">Default login: <b>admin / admin123</b>. You can change credentials in Settings.</div>
      </form>
    </div>
  `;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: e.target.u.value, password: e.target.p.value }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      token = j.token;
      localStorage.setItem('adminToken', token);
      start();
    } catch (err) {
      $('#le').textContent = err.message;
    }
  };
}

function logout() {
  token = '';
  localStorage.removeItem('adminToken');
  A.es && A.es.close();
  showLogin();
}

/* ---------- boot ---------- */
async function start() {
  try {
    [A.settings, A.items, A.cats, A.tables] = await Promise.all([
      api('/api/admin/settings'),
      api('/api/items'),
      api('/api/categories'),
      api('/api/admin/tables'),
    ]);
    await loadLive();
  } catch (e) {
    if (token) toast(e.message, true);
    return;
  }
  document.title = (A.settings.cafeName || 'Café') + ' – Admin';
  connect();
  shell();
  show(A.view);
}

function connect() {
  A.es && A.es.close();
  const es = (A.es = new EventSource('/api/events?token=' + encodeURIComponent(token)));
  es.onopen = () => {
    A.connected = true;
    paintConn();
    loadLive().then(() => A.view === 'live' && show('live'));
  };
  es.onerror = () => {
    A.connected = false;
    paintConn();
  };
  es.addEventListener('order', (e) => {
    const o = JSON.parse(e.data);
    const i = A.live.findIndex((x) => x.id === o.id);
    const isNew = i < 0 && o.status === 'new';
    if (['new', 'preparing', 'ready'].includes(o.status)) {
      if (i >= 0) A.live[i] = o;
      else A.live.push(o);
    } else if (i >= 0) {
      A.live.splice(i, 1);
    }
    if (isNew) {
      A.fresh.add(o.id);
      beep();
      flashTitle(o);
      toast(`🔔 New order #${o.number} · Table ${o.table}`);
    }
    if (A.view === 'live') show('live');
    else paintBadge();
  });
  es.addEventListener('items', async () => {
    A.items = await api('/api/items');
    A.cats = await api('/api/categories');
    if (A.view === 'items') show('items');
  });
}

const loadLive = async () => {
  A.live = await api('/api/admin/orders?view=live');
};

function paintConn() {
  const c = $('#conn');
  if (c) {
    c.className = 'conn' + (A.connected ? '' : ' off');
    c.lastChild.textContent = A.connected ? ' Live' : ' Reconnecting…';
  }
}

function paintBadge() {
  const b = $('#nbadge');
  if (b) {
    const n = A.live.filter((o) => o.status === 'new').length;
    b.textContent = n;
    b.style.display = n ? '' : 'none';
  }
}

let actx;
function beep() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(actx.destination);
      const t = actx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t);
      o.stop(t + 0.32);
    });
  } catch {}
}

let flashT;
const baseTitle = document.title;
function flashTitle(o) {
  clearInterval(flashT);
  let on = 0;
  flashT = setInterval(() => {
    document.title = on++ % 2 ? baseTitle : `🔔 Order #${o.number}!`;
    if (on > 10) {
      clearInterval(flashT);
      document.title = baseTitle;
    }
  }, 800);
}

document.addEventListener('click', () => {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume();
  } catch {}
}, { once: true });

/* ---------- shell ---------- */
function shell() {
  $('#root').innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="side-brand">
          ${LOGO_SVG}
          <div class="info">
            <b>${esc(A.settings.cafeName || '[YOUR CAFE]')}</b>
            <span>Admin</span>
          </div>
        </div>
        ${NAV.map(([k, ic, l]) => `
          <button class="nav-i" data-nav="${k}">
            <span class="ic">${ic}</span>
            <span>${l}</span>
            ${k === 'live' ? '<span class="badge" id="nbadge"></span>' : ''}
          </button>
        `).join('')}
        <div class="spacer"></div>
        <button class="nav-i" id="lo">
          <span class="ic">↩</span>
          <span>Log out</span>
        </button>
      </aside>
      <main class="main" id="main"></main>
    </div>
  `;
  $$('[data-nav]').forEach((b) => (b.onclick = () => show(b.dataset.nav)));
  $('#lo').onclick = logout;
}

function show(v) {
  A.view = v;
  $$('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === v));
  ({ live: vLive, items: vItems, tables: vTables, reports: vReports, history: vHistory, settings: vSettings })[v]();
  paintBadge();
}

const head = (t, extra = '') => `
  <div class="head">
    <h1>${t}</h1>
    <div class="head-actions">
      ${extra}
      <div class="avatar-badge" title="Logged in as Admin" style="margin-left:6px">A</div>
    </div>
  </div>
`;

/* ---------- live orders ---------- */
function orderCard(o, fresh) {
  const btns = {
    new: `
      <button class="btn primary sm" data-st="preparing" data-id="${o.id}">Accept</button>
      <button class="btn ghost sm danger" data-rej="${o.id}">Reject</button>
    `,
    preparing: `
      <button class="btn ghost sm" data-st="ready" data-id="${o.id}">Mark ready</button>
    `,
    ready: `
      <button class="btn primary sm" data-st="served" data-id="${o.id}">Mark served</button>
    `,
  }[o.status];

  return `
    <div class="ocard ${fresh ? 'fresh' : ''}">
      <div class="top">
        <span>#${o.number}</span>
        <span class="pill">Table ${o.table}</span>
      </div>
      <div class="lines">
        ${o.items.map((l) => `${l.qty} × ${esc(l.name)}${l.size ? ` <small>(${esc(l.size)})</small>` : ''}`).join(', ')}
      </div>
      ${o.note ? `<div class="note">📝 Note: ${esc(o.note)}</div>` : ''}
      <div class="meta">
        <span>🕒 ${timeAgo(o.createdAt)}</span>
        <span class="tag ${o.paymentStatus}">
          ${o.paymentStatus === 'paid' ? 'Paid' : o.paymentMethod === 'upi' ? 'UPI · unpaid' : 'Pay at counter'}
        </span>
      </div>
      <div class="amt">${money(o.total)}</div>
      <div class="btns">
        ${btns}
        <button class="btn sm" data-bill="${o.id}">Bill</button>
      </div>
    </div>
  `;
}

function vLive() {
  const by = (s) => A.live.filter((o) => o.status === s).sort((a, b) => a.number - b.number);
  const newOrders = by('new');
  const prepOrders = by('preparing');
  const readyOrders = by('ready');

  const col = (t, s, list) => `
    <div class="col" data-col="${s}" style="${A.colTab !== 'all' && A.colTab !== s ? 'display:none' : ''}">
      <h3>
        <span>${t}</span>
        <span class="col-badge">${list.length}</span>
      </h3>
      ${list.map((o) => orderCard(o, A.fresh.has(o.id))).join('') || '<div class="colempty">No orders in this stage</div>'}
    </div>
  `;

  $('#main').innerHTML =
    head('Live orders', `
      <div class="conn" id="conn"><i></i> Live</div>
      <button class="toggle-btn" id="acc" title="Toggle order acceptance">
        <span>Accepting orders</span>
        <span class="toggle ${A.settings.acceptingOrders ? 'on' : ''}"></span>
      </button>
    `) +
    `
      <div class="mobile-col-tabs">
        <button class="${A.colTab === 'all' ? 'on' : ''}" data-coltab="all">All (${A.live.length})</button>
        <button class="${A.colTab === 'new' ? 'on' : ''}" data-coltab="new">New (${newOrders.length})</button>
        <button class="${A.colTab === 'preparing' ? 'on' : ''}" data-coltab="preparing">Preparing (${prepOrders.length})</button>
        <button class="${A.colTab === 'ready' ? 'on' : ''}" data-coltab="ready">Ready (${readyOrders.length})</button>
      </div>
      <div class="cols">
        ${col('New', 'new', newOrders)}
        ${col('Preparing', 'preparing', prepOrders)}
        ${col('Ready', 'ready', readyOrders)}
      </div>
    `;

  paintConn();

  // Mobile col tab switcher
  $$('[data-coltab]').forEach((b) => {
    b.onclick = () => {
      A.colTab = b.dataset.coltab;
      vLive();
    };
  });

  $('#acc').onclick = guard(async () => {
    A.settings = await api('/api/admin/settings', { method: 'PUT', body: { acceptingOrders: !A.settings.acceptingOrders } });
    show('live');
    toast(A.settings.acceptingOrders ? 'Now accepting orders' : 'Orders paused');
  });

  $('#main').onclick = guard(async (e) => {
    const b = e.target.closest('[data-st],[data-rej],[data-bill]');
    if (!b) return;

    if (b.dataset.st) {
      A.fresh.delete(b.dataset.id);
      await api(`/api/admin/orders/${b.dataset.id}/status`, { method: 'PATCH', body: { status: b.dataset.st } });
      toast(`Order updated to ${b.dataset.st}`);
    } else if (b.dataset.rej) {
      const reason = prompt('Reason for rejecting (shown to the customer):', 'Item unavailable');
      if (reason === null) return;
      A.fresh.delete(b.dataset.rej);
      await api(`/api/admin/orders/${b.dataset.rej}/status`, { method: 'PATCH', body: { status: 'rejected', reason } });
      toast('Order rejected');
    } else if (b.dataset.bill) {
      billModal(A.live.find((o) => o.id === b.dataset.bill));
    }
  });
}

setInterval(() => {
  if (A.view === 'live' && !$('.modal')) show('live');
}, 60000);

/* ---------- bill ---------- */
function billHtml(o) {
  return `
    <div class="bill">
      <h3>${esc(A.settings.cafeName)}</h3>
      <div class="c">${esc(A.settings.tagline)}</div>
      <hr>
      <div class="r"><span>Order #${o.number}</span><span>Table ${o.table}</span></div>
      <div class="r"><span>${fmtDT(o.createdAt)}</span><span>${o.status.toUpperCase()}</span></div>
      <hr>
      ${o.items.map((l) => `<div class="r"><span>${l.qty} × ${esc(l.name)}${l.size ? ` (${esc(l.size)})` : ''}</span><span>${money(l.qty * l.unitPrice)}</span></div>`).join('')}
      <hr>
      <div class="r"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
      <div class="r"><span>Tax (${o.taxPercent}%)</span><span>${money(o.tax)}</span></div>
      <div class="r"><b>TOTAL</b><b>${money(o.total)}</b></div>
      <hr>
      <div class="r"><span>Payment</span><span>${o.paymentStatus.toUpperCase()} (${o.paymentMethod})</span></div>
      <hr>
      <div class="c">Thank you! Visit again ☕</div>
    </div>
  `;
}

function modal(html) {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.addEventListener('mousedown', (e) => {
    if (e.target === m) m.remove();
  });
  document.body.appendChild(m);
  return m;
}

function printHtml(html) {
  const p = $('#printRoot');
  p.innerHTML = html;
  document.body.classList.add('printing');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing');
    p.innerHTML = '';
  }, 500);
}

function billModal(o) {
  const m = modal(`
    ${billHtml(o)}
    <div class="foot" style="margin-top:16px">
      <button class="btn" data-x>Close</button>
      <button class="btn ghost" data-pay>${o.paymentStatus === 'paid' ? 'Mark unpaid' : 'Mark as paid'}</button>
      <button class="btn primary" data-print>🖨 Print Bill</button>
    </div>
  `);
  m.onclick = guard(async (e) => {
    if (e.target.closest('[data-x]')) m.remove();
    if (e.target.closest('[data-print]')) printHtml(billHtml(o));
    if (e.target.closest('[data-pay]')) {
      const u = await api(`/api/admin/orders/${o.id}/payment`, {
        method: 'PATCH',
        body: { paymentStatus: o.paymentStatus === 'paid' ? 'unpaid' : 'paid' },
      });
      const i = A.live.findIndex((x) => x.id === o.id);
      if (i >= 0) A.live[i] = u;
      m.remove();
      toast('Payment updated');
      show(A.view);
    }
  });
}

/* ---------- menu items ---------- */
function vItems() {
  const { q, cat } = A.filters;
  const list = A.items.filter((i) => (!cat || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const cname = (id) => A.cats.find((c) => c.id === id)?.name || id;

  $('#main').innerHTML =
    head('Menu items', '<button class="btn" id="addcat">+ Category</button><button class="btn primary" id="add">+ Add Item</button>') +
    `
      <div class="toolbar">
        <input class="grow" id="q" placeholder="Search items…" value="${esc(q)}">
        <select id="cf">
          <option value="">All categories</option>
          ${A.cats.map((c) => `<option value="${esc(c.id)}" ${c.id === cat ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th></th>
              <th>Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>In stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map((i) => `
              <tr class="${i.isAvailable ? '' : 'oos'}">
                <td>
                  <div class="thumb">
                    ${i.image ? `<img src="${esc(i.image)}" alt="">` : esc(i.emoji || '🍽️')}
                  </div>
                </td>
                <td>
                  <b>${esc(i.name)}</b>
                  <span class="veg ${i.isVeg ? '' : 'non'}"></span>
                  ${i.sizes?.length ? `<br><small style="color:var(--muted)">${i.sizes.map((s) => esc(s.name)).join(' / ')}</small>` : ''}
                </td>
                <td>${esc(cname(i.category))}</td>
                <td><b>${money(i.price)}</b></td>
                <td>
                  <button class="toggle ${i.isAvailable ? 'on' : ''}" data-av="${i.id}" aria-label="Toggle availability"></button>
                </td>
                <td>
                  <div class="acts">
                    <button class="btn sm" data-edit="${i.id}">Edit</button>
                    <button class="btn danger sm" data-del="${i.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" style="background:none;text-align:center;color:var(--muted);padding:30px">No items found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

  $('#q').oninput = (e) => {
    A.filters.q = e.target.value;
    const p = e.target.selectionStart;
    vItems();
    const n = $('#q');
    n.focus();
    n.setSelectionRange(p, p);
  };
  $('#cf').onchange = (e) => {
    A.filters.cat = e.target.value;
    vItems();
  };
  $('#add').onclick = () => itemForm();
  $('#addcat').onclick = guard(async () => {
    const name = prompt('New category name:');
    if (!name) return;
    const emoji = prompt('Emoji for it (optional):', '🍽️') || '';
    await api('/api/admin/categories', { method: 'POST', body: { name, emoji } });
    toast('Category added');
  });

  $('#main').onclick = guard(async (e) => {
    const b = e.target.closest('[data-av],[data-edit],[data-del]');
    if (!b) return;
    if (b.dataset.av) {
      await api(`/api/admin/items/${b.dataset.av}/availability`, { method: 'PATCH', body: {} });
    }
    if (b.dataset.edit) itemForm(A.items.find((i) => i.id === b.dataset.edit));
    if (b.dataset.del) {
      const it = A.items.find((i) => i.id === b.dataset.del);
      const m = modal(`
        <h2>Delete this item?</h2>
        <p style="color:var(--muted);margin-bottom:16px">
          <b>${esc(it.name)}</b> will be removed from the menu. Old bills are not affected. If it's only temporarily unavailable, use the stock toggle switch instead.
        </p>
        <div class="foot">
          <button class="btn" data-x>Cancel</button>
          <button class="btn danger" data-ok>Delete</button>
        </div>
      `);
      m.onclick = guard(async (ev) => {
        if (ev.target.closest('[data-x]')) m.remove();
        if (ev.target.closest('[data-ok]')) {
          await api(`/api/admin/items/${it.id}`, { method: 'DELETE' });
          m.remove();
          toast('Item deleted');
        }
      });
    }
  });
}

function itemForm(it) {
  const d = it || { name: '', category: A.cats[0]?.id, price: '', description: '', image: '', emoji: '', isVeg: true, isAvailable: true, sizes: [] };
  const m = modal(`
    <h2>${it ? 'Edit item' : 'Add item'}</h2>
    <form id="if">
      <div class="imgpick">
        <div class="thumb" id="ip">${d.image ? `<img src="${esc(d.image)}">` : esc(d.emoji || '🍽️')}</div>
        <div>
          <label class="btn sm" style="cursor:pointer">
            Upload image
            <input type="file" id="file" accept="image/png,image/jpeg,image/webp" hidden>
          </label>
          <button type="button" class="btn sm ghost ${d.image ? '' : 'hidden'}" id="rmimg">Remove</button>
          <div class="hint" style="margin:6px 0 0">JPG/PNG/WebP · auto-resized</div>
        </div>
      </div>
      <label class="field"><span>Name *</span><input name="name" required maxlength="80" value="${esc(d.name)}"></label>
      <div class="row2">
        <label class="field">
          <span>Category *</span>
          <select name="category">${A.cats.map((c) => `<option value="${esc(c.id)}" ${c.id === d.category ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select>
        </label>
        <label class="field">
          <span>Price (${esc(A.settings.currency)}) *</span>
          <input name="price" type="number" min="0" step="1" required value="${esc(d.price)}">
        </label>
      </div>
      <label class="field"><span>Description</span><textarea name="description" rows="2" maxlength="400">${esc(d.description)}</textarea></label>
      <div class="row2">
        <label class="field"><span>Emoji (shown if no image)</span><input name="emoji" maxlength="4" value="${esc(d.emoji)}"></label>
        <label class="field"><span>Sizes (optional)</span><input name="sizes" placeholder="Tall:0, Grande:30, Venti:60" value="${esc((d.sizes || []).map((s) => s.name + ':' + s.extra).join(', '))}"></label>
      </div>
      <div class="switchrow">
        <div class="seg">
          <button type="button" data-veg="1" class="${d.isVeg ? 'on' : ''}">🟢 Veg</button>
          <button type="button" data-veg="0" class="${d.isVeg ? '' : 'on'}">🔴 Non-veg</button>
        </div>
        <span style="flex:1"></span>
        <span>Available</span>
        <button type="button" class="toggle ${d.isAvailable ? 'on' : ''}" id="av"></button>
      </div>
      <div class="foot">
        <button type="button" class="btn" data-x>Cancel</button>
        <button class="btn primary">${it ? 'Save changes' : 'Add item'}</button>
      </div>
    </form>
  `);

  let image = d.image, isVeg = d.isVeg, isAvailable = d.isAvailable;
  $('[data-x]', m).onclick = () => m.remove();
  $$('[data-veg]', m).forEach((b) => (b.onclick = () => {
    isVeg = b.dataset.veg === '1';
    $$('[data-veg]', m).forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#av', m).onclick = (e) => {
    isAvailable = !isAvailable;
    e.target.classList.toggle('on', isAvailable);
  };
  $('#rmimg', m).onclick = () => {
    image = '';
    $('#ip', m).innerHTML = esc($('[name=emoji]', m).value || '🍽️');
    $('#rmimg', m).classList.add('hidden');
  };
  $('#file', m).onchange = guard(async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const dataUrl = await resize(f, 700);
    const r = await api('/api/admin/upload', { method: 'POST', body: { dataUrl } });
    image = r.url;
    $('#ip', m).innerHTML = `<img src="${esc(image)}">`;
    $('#rmimg', m).classList.remove('hidden');
  });
  $('#if', m).onsubmit = guard(async (e) => {
    e.preventDefault();
    const f = e.target;
    const sizes = f.sizes.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [n, x] = s.split(':');
        return { name: (n || '').trim(), extra: Number(x) || 0 };
      });
    const body = {
      name: f.name.value,
      category: f.category.value,
      price: Number(f.price.value),
      description: f.description.value,
      emoji: f.emoji.value,
      image,
      isVeg,
      isAvailable,
      sizes,
    };
    await api(it ? `/api/admin/items/${it.id}` : '/api/admin/items', { method: it ? 'PUT' : 'POST', body });
    m.remove();
    toast(it ? 'Item updated' : 'Item added');
  });
}

function resize(file, max) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => rej(new Error('Could not read that image'));
    img.src = url;
  });
}

/* ---------- tables & QR ---------- */
const baseUrl = () => (A.settings.publicUrl || location.origin).replace(/\/+$/, '');
const tableUrl = (n) => `${baseUrl()}/?table=${n}`;

function drawQr(el, text, size = 150) {
  if (!el) return;
  el.innerHTML = '';
  if (window.QRCode) {
    new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
  } else {
    el.innerHTML = `<img width="${size}" height="${size}" alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=${size * 2}x${size * 2}&data=${encodeURIComponent(text)}">`;
  }
}

function vTables() {
  $('#main').innerHTML =
    head('Tables & QR', '<button class="btn" id="pall">🖨 Print all</button>') +
    `
      <div class="panel">
        <div class="toolbar" style="margin:0">
          <label class="field grow" style="margin:0">
            <span>Your café website address (the QR opens this)</span>
            <input id="base" placeholder="https://yourcafe.com" value="${esc(A.settings.publicUrl)}">
          </label>
          <button class="btn primary" id="sb">Save URL</button>
        </div>
        <div class="hint">Currently: <b>${esc(baseUrl())}</b>. If testing on phones on the same Wi-Fi, set your PC's IP address (e.g. http://192.168.1.5:3000).</div>
      </div>
      <div class="toolbar">
        <input id="tn" type="number" min="1" placeholder="Table no." style="width:120px">
        <input id="tl" placeholder="Label (optional, e.g. Window side)" class="grow">
        <button class="btn primary" id="at">+ Add table</button>
      </div>
      <div class="tgrid">
        ${A.tables.map((t) => `
          <div class="tcard" style="${t.active ? '' : 'opacity:.55'}">
            <h4>Table ${t.number}${t.label ? ` · ${esc(t.label)}` : ''}</h4>
            <div class="qr" id="qr${t.number}"></div>
            <div class="u">${esc(tableUrl(t.number))}</div>
            <div class="btns">
              <button class="btn sm" data-dl="${t.number}">Download</button>
              <button class="btn sm" data-pt="${t.number}">Print</button>
              <button class="btn danger sm" data-dt="${t.number}">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

  A.tables.forEach((t) => drawQr($('#qr' + t.number), tableUrl(t.number)));

  $('#sb').onclick = guard(async () => {
    A.settings = await api('/api/admin/settings', { method: 'PUT', body: { publicUrl: $('#base').value } });
    toast('Address saved');
    vTables();
  });
  $('#at').onclick = guard(async () => {
    await api('/api/admin/tables', { method: 'POST', body: { number: $('#tn').value, label: $('#tl').value } });
    A.tables = await api('/api/admin/tables');
    vTables();
    toast('Table added');
  });

  const printTables = (list) => {
    const wrap = document.createElement('div');
    wrap.className = 'tprint';
    list.forEach((t) => {
      const c = document.createElement('div');
      c.className = 'tcard';
      c.innerHTML = `
        <h4 style="font-size:22px">${esc(A.settings.cafeName)}</h4>
        <div style="font-size:14px;margin-bottom:8px">Scan to order · Table ${t.number}</div>
        <div class="qr" style="width:200px;height:200px"></div>
        <div class="u">${esc(tableUrl(t.number))}</div>
      `;
      wrap.appendChild(c);
      drawQr($('.qr', c), tableUrl(t.number), 200);
    });
    const p = $('#printRoot');
    p.innerHTML = '';
    p.appendChild(wrap);
    document.body.classList.add('printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing');
        p.innerHTML = '';
      }, 500);
    }, 200);
  };

  $('#pall').onclick = () => printTables(A.tables.filter((t) => t.active));

  $('#main').onclick = guard(async (e) => {
    const b = e.target.closest('[data-dl],[data-pt],[data-dt]');
    if (!b) return;
    if (b.dataset.pt) printTables(A.tables.filter((t) => String(t.number) === b.dataset.pt));
    if (b.dataset.dl) {
      const box = $('#qr' + b.dataset.dl);
      const src = $('canvas', box)?.toDataURL('image/png') || $('img', box)?.src;
      if (!src) return toast('QR not ready', true);
      const a = document.createElement('a');
      a.href = src;
      a.download = `table-${b.dataset.dl}-qr.png`;
      a.click();
    }
    if (b.dataset.dt && confirm(`Delete Table ${b.dataset.dt}? Its QR code will stop working.`)) {
      await api('/api/admin/tables/' + b.dataset.dt, { method: 'DELETE' });
      A.tables = await api('/api/admin/tables');
      vTables();
      toast('Table deleted');
    }
  });
}

/* ---------- reports ---------- */
async function vReports() {
  $('#main').innerHTML = head('Reports') + '<p style="color:var(--muted)">Loading reports…</p>';
  const r = await api('/api/admin/reports?days=' + A.days);
  const max = Math.max(1, ...r.daily.map((d) => d.revenue));
  const today = r.daily.at(-1);

  $('#main').innerHTML =
    head('Reports', `
      <div class="seg">
        ${[[1, 'Today'], [7, '7 days'], [30, '30 days']].map(([d, l]) => `<button data-d="${d}" class="${A.days === d ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    `) +
    `
      <div class="stats">
        <div class="stat"><small>Total Sales</small><b>${money(r.revenue)}</b></div>
        <div class="stat"><small>Orders Placed</small><b>${r.orders}</b></div>
        <div class="stat"><small>Average Order</small><b>${money(r.avgOrder)}</b></div>
        <div class="stat"><small>Collected</small><b>${money(r.paidRevenue)}</b></div>
        <div class="stat"><small>Unpaid / Counter</small><b>${money(r.unpaidRevenue)}</b></div>
        <div class="stat"><small>Cancelled</small><b>${r.cancelled}</b></div>
      </div>
      <div class="two">
        <div class="panel">
          <h3>Daily Sales Performance</h3>
          <div class="bars">
            ${r.daily.map((d) => `
              <div class="bar ${d === today ? 'today' : ''}" title="${d.date}: ${money(d.revenue)} · ${d.orders} orders">
                <b>${d.revenue && r.daily.length <= 10 ? money(d.revenue) : ''}</b>
                <i style="height:${(d.revenue / max) * 100}%"></i>
                <span>${r.daily.length > 10 ? d.date.slice(8) : d.date.slice(5)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="panel">
          <h3>Top Selling Items</h3>
          ${r.topItems.length ? `
            <ol class="toplist">
              ${r.topItems.map((t, i) => `
                <li>
                  <span class="n">${i + 1}</span>
                  <span class="g">${esc(t.name)}</span>
                  <span class="q">${t.qty} sold · ${money(t.revenue)}</span>
                </li>
              `).join('')}
            </ol>
          ` : '<div class="colempty">No sales yet</div>'}
        </div>
      </div>
    `;

  $$('[data-d]').forEach((b) => {
    b.onclick = () => {
      A.days = +b.dataset.d;
      vReports();
    };
  });
}

/* ---------- history ---------- */
async function vHistory() {
  const h = A.hist;
  $('#main').innerHTML =
    head('Order history') +
    `
      <div class="toolbar">
        <input class="grow" id="hq" placeholder="Search order #, table, item…" value="${esc(h.q)}">
        <input type="date" id="hf" value="${h.from}">
        <input type="date" id="ht" value="${h.to}">
        <select id="hs">
          <option value="">All statuses</option>
          ${['new', 'preparing', 'ready', 'served', 'rejected'].map((s) => `<option ${h.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div id="hl"></div>
    `;

  const load = guard(async () => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(h).filter(([, v]) => v)));
    const list = await api('/api/admin/orders?' + qs);
    $('#hl').innerHTML = `
      <div class="scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Time</th>
              <th>Table</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map((o) => `
              <tr>
                <td><b>#${o.number}</b></td>
                <td>${fmtDT(o.createdAt)}</td>
                <td>${o.table}</td>
                <td style="max-width:260px">${o.items.map((l) => `${l.qty}× ${esc(l.name)}`).join(', ')}</td>
                <td><b>${money(o.total)}</b></td>
                <td><span class="tag s-${o.status}">${o.status}</span></td>
                <td><span class="tag ${o.paymentStatus}">${o.paymentStatus}</span></td>
                <td><button class="btn sm" data-b="${o.id}">Bill</button></td>
              </tr>
            `).join('') || '<tr><td colspan="8" style="background:none;text-align:center;color:var(--muted);padding:30px">No orders found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    $('#hl').onclick = (e) => {
      const b = e.target.closest('[data-b]');
      if (b) billModal(list.find((o) => o.id === b.dataset.b));
    };
  });

  let t;
  $('#hq').oninput = (e) => {
    h.q = e.target.value;
    clearTimeout(t);
    t = setTimeout(load, 250);
  };
  $('#hf').onchange = (e) => { h.from = e.target.value; load(); };
  $('#ht').onchange = (e) => { h.to = e.target.value; load(); };
  $('#hs').onchange = (e) => { h.status = e.target.value; load(); };
  load();
}

/* ---------- settings ---------- */
function vSettings() {
  const s = A.settings;
  $('#main').innerHTML =
    head('Settings') +
    `
      <div class="two">
        <form class="panel" id="sf">
          <h3>Café Details</h3>
          <label class="field">
            <span>Café name</span>
            <input name="cafeName" value="${esc(s.cafeName)}" required>
          </label>
          <label class="field">
            <span>Tagline</span>
            <input name="tagline" value="${esc(s.tagline)}">
          </label>
          <label class="field">
            <span>Tax (%)</span>
            <input name="taxPercent" type="number" min="0" max="50" step="0.5" value="${s.taxPercent}">
          </label>
          <button class="btn primary">Save Settings</button>
        </form>
        <form class="panel" id="pf">
          <h3>Change Admin Password</h3>
          <label class="field">
            <span>Current password</span>
            <input name="c" type="password" autocomplete="current-password" required>
          </label>
          <label class="field">
            <span>New password (6+ chars)</span>
            <input name="n" type="password" autocomplete="new-password" required minlength="6">
          </label>
          <button class="btn primary">Update Password</button>
        </form>
      </div>
    `;

  $('#sf').onsubmit = guard(async (e) => {
    e.preventDefault();
    const f = e.target;
    A.settings = await api('/api/admin/settings', {
      method: 'PUT',
      body: { cafeName: f.cafeName.value, tagline: f.tagline.value, taxPercent: f.taxPercent.value },
    });
    toast('Settings saved');
    $('.side-brand .info b').textContent = A.settings.cafeName;
  });

  $('#pf').onsubmit = guard(async (e) => {
    e.preventDefault();
    const f = e.target;
    const r = await api('/api/admin/password', { method: 'POST', body: { current: f.c.value, next: f.n.value } });
    token = r.token;
    localStorage.setItem('adminToken', token);
    connect();
    f.reset();
    toast('Password updated');
  });
}

token ? start() : showLogin();
