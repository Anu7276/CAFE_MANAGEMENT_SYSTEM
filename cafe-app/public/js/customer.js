/* Customer ordering app – Full Mobile & Desktop PC responsive web experience */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const api = async (path, opts = {}) => {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
};

function toast(msg, err) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = 'toast'), 2600);
}

const S = {
  settings: { cafeName: '[YOUR CAFE]', tagline: 'Good Coffee. Good Mood.', taxPercent: 5, acceptingOrders: true, currency: '₹' },
  categories: [],
  items: [],
  cat: 'all',
  searchQuery: '',
  vegOnly: false,
  screen: 'menu',      // 'menu' | 'detail' | 'cart' | 'status'
  detailModal: null,   // item shown in modal on desktop
  detail: null,        // item shown on mobile detail screen
  sel: { size: '', qty: 1 },
  cardQty: {},
  cardSize: {},
  favs: store.get('favs', []),
  cart: store.get('cart', []),
  table: null,
  orderId: store.get('orderId', null),
  order: null,
  note: '',
  pay: 'counter',
  placing: false,
};

const money = (n) => (S.settings.currency || '₹') + Number(n).toLocaleString('en-IN');
const item = (id) => S.items.find((i) => i.id === id);
const cat = (id) => S.categories.find((c) => c.id === id);
const isLiked = (id) => S.favs.includes(id);

const unit = (l) => {
  const it = item(l.id);
  if (!it) return 0;
  const s = (it.sizes || []).find((s) => s.name === l.size);
  return it.price + (s ? s.extra : 0);
};

const cartCount = () => S.cart.reduce((n, l) => n + l.qty, 0);
const subtotal = () => S.cart.reduce((n, l) => n + unit(l) * l.qty, 0);
const tax = () => Math.round((subtotal() * (S.settings.taxPercent || 5)) / 100);
const saveCart = () => store.set('cart', S.cart);
const isDesktop = () => window.innerWidth >= 1024;

const LOGO = `<svg class="logo" viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 10c-3 3 3 5 0 8M27 8c-3 3 3 5 0 10M36 10c-3 3 3 5 0 8"/>
  <path d="M8 28h38v10a14 14 0 0 1-14 14h-10A14 14 0 0 1 8 38z"/>
  <path d="M46 31h4a6 6 0 0 1 0 14h-6"/>
  <path d="M6 58h46"/>
</svg>`;

const thumb = (it, cls = '') => `
  <div class="thumb ${cls}">
    ${it.image ? `<img src="${esc(it.image)}" alt="${esc(it.name)}" loading="lazy">` : esc(it.emoji || cat(it.category)?.emoji || '☕')}
  </div>
`;

/* ---------- boot ---------- */
async function boot() {
  const params = new URLSearchParams(location.search);
  const t = params.get('table') || store.get('table', null);
  if (params.get('table')) store.set('table', params.get('table'));

  try {
    [S.settings, S.categories, S.items] = await Promise.all([api('/api/settings'), api('/api/categories'), api('/api/items')]);
  } catch (e) {
    $('#app').innerHTML = `<div class="card"><h2>Can't reach the café</h2><p class="sub">${esc(e.message)}</p></div>`;
    return;
  }

  document.title = (S.settings.cafeName || 'Café') + ' – Order';

  if (t) {
    try {
      S.table = (await api('/api/tables/' + encodeURIComponent(t))).number;
    } catch {
      S.table = null;
      store.set('table', null);
    }
  }

  if (S.orderId) {
    try {
      S.order = await api('/api/orders/' + S.orderId);
    } catch {
      S.orderId = null;
      store.set('orderId', null);
    }
  }

  S.cart = S.cart.filter((l) => item(l.id));
  render();
  connect();

  if (!S.table) askTable();
}

function connect() {
  const es = new EventSource('/api/events' + (S.orderId ? '?order=' + S.orderId : ''));
  S.es = es;
  es.addEventListener('order', (e) => {
    S.order = JSON.parse(e.data);
    render();
  });
  es.addEventListener('items', async () => {
    S.items = await api('/api/items');
    S.categories = await api('/api/categories');
    S.cart = S.cart.filter((l) => item(l.id));
    saveCart();
    render();
  });
  es.addEventListener('settings', (e) => {
    S.settings = JSON.parse(e.data);
    render();
  });
}

function reconnect() {
  S.es && S.es.close();
  connect();
}

/* ---------- table picker dialog ---------- */
async function askTable() {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <div class="dialog">
      <h3>Which table are you at?</h3>
      <p>Scan the QR code on your table, or type your table number below to order.</p>
      <input id="tn" type="number" min="1" inputmode="numeric" placeholder="Table number (e.g. 5)" value="${S.table || ''}">
      <button class="btn primary block" id="tgo">Continue to Menu</button>
    </div>
  `;
  document.body.appendChild(ov);
  $('#tgo').onclick = async () => {
    const n = $('#tn').value.trim();
    if (!n) return toast('Please enter your table number', true);
    try {
      S.table = (await api('/api/tables/' + encodeURIComponent(n))).number;
      store.set('table', S.table);
      ov.remove();
      render();
      toast(`Welcome to Table ${S.table}!`);
    } catch {
      toast('That table doesn’t exist', true);
    }
  };
}

/* ---------- topbar ---------- */
function topbar() {
  const on = S.settings.acceptingOrders;
  return `
    <header class="topbar">
      ${LOGO}
      <div class="brand">
        <b>${esc(S.settings.cafeName || '[YOUR CAFE]')}</b>
        <span>${esc(S.settings.tagline || 'Good Coffee. Good Mood.')}</span>
      </div>
      <div class="topbar-actions">
        <button class="table-pill" data-act="changetable" title="Change Table">
          <span>🪑</span>
          <b>${S.table ? `Table ${S.table}` : 'Set Table'}</b>
        </button>
        <div class="status ${on ? '' : 'off'}">
          <i></i>${on ? 'Online' : 'Paused'}
        </div>
        <div class="avatar-badge" title="Customer">A</div>
      </div>
    </header>
  `;
}

/* ---------- render orchestrator ---------- */
function render() {
  const app = $('#app');
  if (isDesktop() && S.screen === 'menu') {
    app.innerHTML = viewDesktopSplit();
  } else {
    const v = { menu: viewMenu, detail: viewDetail, cart: viewCart, status: viewStatus }[S.screen];
    app.innerHTML = v ? v() : viewMenu();
  }
  if (S.detailModal) {
    renderDetailModal();
  }
  bind();
}

function go(screen) {
  S.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Menu View (Mobile & Shared Content) ---------- */
function getFilteredItems() {
  return S.items.filter((i) => {
    const matchCat = S.cat === 'all' || i.category === S.cat;
    const matchVeg = !S.vegOnly || i.isVeg;
    const matchQ = !S.searchQuery || i.name.toLowerCase().includes(S.searchQuery.toLowerCase()) || (i.description && i.description.toLowerCase().includes(S.searchQuery.toLowerCase()));
    return matchCat && matchVeg && matchQ;
  });
}

function dishCardHtml(i) {
  const hasSizes = i.sizes && i.sizes.length > 0;
  const liked = isLiked(i.id);
  const qty = S.cardQty[i.id] || 1;

  return `
    <div class="fullbleed-dish-card ${i.isAvailable ? '' : 'out'}" data-card-id="${i.id}">
      <!-- Crisp Full-Bleed Food Image -->
      <img class="dish-bg-img" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy" data-open="${i.id}" />

      <!-- Top Floating Navigation / Badges -->
      <div class="card-top-bar">
        <div class="top-tag-wrap">
          <span class="veg-badge ${i.isVeg ? '' : 'non'}" title="${i.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}">
            <span class="veg-dot"></span>
          </span>
          ${i.isAvailable ? '' : '<span class="out-tag">Sold Out</span>'}
          ${hasSizes ? `<span class="custom-badge" data-open="${i.id}" title="Tap to customize size">Options</span>` : ''}
        </div>
        <div class="top-actions-wrap">
          <button class="top-circle-btn ${liked ? 'liked' : ''}" data-like="${i.id}" title="Favorite" aria-label="Favorite">
            ${liked ? '❤️' : '🤍'}
          </button>
          <button class="top-circle-btn" data-open="${i.id}" title="Customize / Details" aria-label="Details">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Bottom Crystal Clear Vignette Scrim (ZERO Fog, ZERO Milky Blur) -->
      <div class="card-bottom-scrim">
        <!-- 3-Dot Carousel Indicator (Matching user reference) -->
        <div class="card-dots">
          <span class="dot"></span>
          <span class="dot active"></span>
          <span class="dot"></span>
        </div>

        <!-- Title & Coral Red Price Row -->
        <div class="card-title-price-row">
          <h3 class="card-item-title" data-open="${i.id}" title="View Details">${esc(i.name)}</h3>
          <span class="card-item-price">${money(i.price)}</span>
        </div>

        <!-- 2-Line Appetizing Description -->
        <p class="card-item-desc" data-open="${i.id}">${esc(i.description || '')}</p>

        <!-- Bottom Action Row: Dark Pill Stepper + Pure White Add to Cart Pill -->
        <div class="card-actions-row">
          <div class="dark-pill-stepper">
            <button data-card-q="-1" data-for-item="${i.id}" aria-label="Decrease quantity">−</button>
            <span>${qty}</span>
            <button data-card-q="1" data-for-item="${i.id}" aria-label="Increase quantity">+</button>
          </div>
          <button class="white-add-btn" data-card-add="${i.id}" ${i.isAvailable && S.settings.acceptingOrders ? '' : 'disabled'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span>Add to Cart</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function viewMenu() {
  const list = getFilteredItems();
  const o = S.order;
  const active = o && !['served', 'rejected'].includes(o.status);
  const LBL = { new: 'Received', preparing: 'Preparing', ready: 'Ready', served: 'Served', rejected: 'Not accepted' };
  const n = cartCount();

  return `
    ${topbar()}
    <section class="card">
      <div class="menu-head-row">
        <span class="eyebrow">1. MENU${S.table ? ` · TABLE ${S.table}` : ''}</span>
      </div>
      <h1 class="hero">Smooth Out <em>Your Everyday</em></h1>

      ${o ? `
        <button class="trackbanner" data-act="track">
          <span style="font-size:20px">🧾</span>
          <div>
            <b>Order #${o.number}</b>
            <small>${LBL[o.status] || o.status}${active ? ' · live tracking' : ''}</small>
          </div>
          <span class="go">Track ›</span>
        </button>
      ` : ''}

      ${S.settings.acceptingOrders ? '' : '<div class="banner bad">We’re not taking orders right now. Please ask our staff.</div>'}

      <div class="filter-bar">
        <div class="search-box">
          <span class="search-ic">🔍</span>
          <input type="text" id="menuSearch" placeholder="Search coffee, drinks, snacks…" value="${esc(S.searchQuery)}">
        </div>
        <button class="veg-toggle-btn ${S.vegOnly ? 'on' : ''}" data-act="toggleveg">
          <span class="veg"></span> Veg only
        </button>
      </div>

      <div class="chips">
        <button class="chip ${S.cat === 'all' ? 'on' : ''}" data-cat="all">
          <div class="thumb">🍽️</div>
          All
        </button>
        ${S.categories.map((c) => `
          <button class="chip ${S.cat === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">
            <div class="thumb">${esc(c.emoji || '☕')}</div>
            ${esc(c.name)}
          </button>
        `).join('')}
      </div>

      <div class="grid">
        ${list.map(dishCardHtml).join('') || '<div class="empty">No items found matching your filter.</div>'}
      </div>
    </section>

    ${n ? `
      <div class="cartbar mobile-only">
        <button class="btn primary" data-act="cart">
          🛒 View cart · ${n} item${n > 1 ? 's' : ''} · ${money(subtotal() + tax())}
        </button>
      </div>
    ` : ''}
  `;
}

/* ---------- Desktop PC 2-Column Split View ---------- */
function viewDesktopSplit() {
  const list = getFilteredItems();
  const o = S.order;
  const active = o && !['served', 'rejected'].includes(o.status);

  return `
    ${topbar()}
    <div class="web-layout">
      <!-- Left Column: Menu -->
      <div class="main-column">
        <section class="card">
          <div class="menu-head-row">
            <span class="eyebrow">1. MENU${S.table ? ` · TABLE ${S.table}` : ''}</span>
          </div>
          <h1 class="hero">Smooth Out <em>Your Everyday</em></h1>

          <div class="filter-bar">
            <div class="search-box">
              <span class="search-ic">🔍</span>
              <input type="text" id="menuSearch" placeholder="Search coffee, food, desserts…" value="${esc(S.searchQuery)}">
            </div>
            <button class="veg-toggle-btn ${S.vegOnly ? 'on' : ''}" data-act="toggleveg">
              <span class="veg"></span> Veg only
            </button>
          </div>

          <div class="chips">
            <button class="chip ${S.cat === 'all' ? 'on' : ''}" data-cat="all">
              <div class="thumb">🍽️</div>
              All
            </button>
            ${S.categories.map((c) => `
              <button class="chip ${S.cat === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">
                <div class="thumb">${esc(c.emoji || '☕')}</div>
                ${esc(c.name)}
              </button>
            `).join('')}
          </div>

          <div class="grid">
            ${list.map(dishCardHtml).join('') || '<div class="empty">No items found. Try searching for something else!</div>'}
          </div>
        </section>
      </div>

      <!-- Right Column: Sticky Your Order / Live Tracker Panel -->
      <div class="side-panel">
        <div class="sticky-panel">
          ${o && active ? renderStatusCardInner(o) : renderCartPanelInner()}
        </div>
      </div>
    </div>
  `;
}

function renderCartPanelInner() {
  const n = cartCount();
  return `
    <section class="card">
      <div class="nav" style="margin-bottom:12px">
        <h2>Your order${S.table ? ` · Table ${S.table}` : ''}</h2>
        ${n ? `<span class="pill">${n} item${n > 1 ? 's' : ''}</span>` : ''}
      </div>

      ${n ? `
        <div class="cart-items-wrap">
          ${S.cart.map((l, idx) => {
            const it = item(l.id);
            if (!it) return '';
            return `
              <div class="line">
                ${thumb(it)}
                <div class="meta">
                  <b>${esc(it.name)}${l.size ? ` <small>(${esc(l.size)})</small>` : ''}</b>
                  <small>${money(unit(l))} each</small>
                </div>
                <div class="stepper">
                  <button data-line="${idx}" data-d="-1">−</button>
                  <span>${l.qty}</span>
                  <button data-line="${idx}" data-d="1">+</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <textarea class="note" id="note" rows="2" maxlength="300" placeholder="Note: for the kitchen: less sugar, extra hot...">${esc(S.note)}</textarea>

        <div class="label">Payment method</div>
        <div class="pay">
          <button data-pay="counter" class="${S.pay === 'counter' ? 'on' : ''}">💵 Pay at counter</button>
          <button data-pay="upi" class="${S.pay === 'upi' ? 'on' : ''}">📲 Pay by UPI</button>
        </div>

        <div class="totals">
          <div><span>Subtotal</span><span>${money(subtotal())}</span></div>
          <div><span>Tax (${S.settings.taxPercent || 5}%)</span><span>${money(tax())}</span></div>
          <div class="grand"><span>Total</span><span>${money(subtotal() + tax())}</span></div>
        </div>

        <button class="btn primary block" data-act="place" ${S.placing || !S.settings.acceptingOrders ? 'disabled' : ''}>
          ${S.placing ? 'Placing order…' : `Place order · ${money(subtotal() + tax())}`}
        </button>
      ` : `
        <div class="empty" style="padding:48px 16px">
          <div style="font-size:46px;margin-bottom:12px">☕</div>
          <h3 style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:6px">Your tray is empty</h3>
          <p style="font-size:13px;color:var(--muted)">Select delicious treats from the menu to build your order.</p>
        </div>
      `}
    </section>
  `;
}

/* =======================================================
   IMMERSIVE HERO ITEM CARD (MATCHES USER UPLOADED SCREENSHOT)
   ======================================================= */
function heroItemCardHtml(it, isModal = false) {
  const sizes = it.sizes || [];
  const curSizeObj = sizes.find((s) => s.name === S.sel.size) || sizes[0] || { name: '', extra: 0 };
  const extra = curSizeObj.extra || 0;
  const liked = isLiked(it.id);

  return `
    <div class="fullbleed-dish-card hero-detail-view ${it.isAvailable ? '' : 'out'}" data-card-id="${it.id}">
      <!-- Crisp Full-Bleed Food Image -->
      <img class="dish-bg-img" src="${esc(it.image)}" alt="${esc(it.name)}" />

      <!-- Floating Top Navigation -->
      <div class="card-top-bar">
        <button class="top-circle-btn" data-act="${isModal ? 'closemodal' : 'back'}" aria-label="Back">
          ${isModal ? '✕' : '←'}
        </button>
        <div class="top-actions-wrap">
          <button class="top-circle-btn ${liked ? 'liked' : ''}" data-like="${it.id}" aria-label="Favorite">
            ${liked ? '❤️' : '🤍'}
          </button>
          <button class="top-circle-btn" data-act="cart" aria-label="Cart">
            🛍️${cartCount() ? `<span class="bag-dot">${cartCount()}</span>` : ''}
          </button>
        </div>
      </div>

      <!-- Bottom Crystal Clear Vignette Scrim (ZERO Fog) -->
      <div class="card-bottom-scrim">
        <!-- 3-dot Carousel indicator matching user screenshot -->
        <div class="card-dots">
          <span class="dot"></span>
          <span class="dot active"></span>
          <span class="dot"></span>
        </div>

        <div class="card-title-price-row">
          <h3 class="card-item-title">${esc(it.name)}</h3>
          <span class="card-item-price">${money(it.price + extra)}</span>
        </div>

        <p class="card-item-desc">${esc(it.description || '')}</p>

        ${sizes.length ? `
          <div class="detail-size-section">
            <span class="detail-size-label">Size options</span>
            <div class="detail-sizes-row">
              ${sizes.map((s) => `
                <button class="detail-size-chip ${curSizeObj.name === s.name ? 'on' : ''}" data-size="${esc(s.name)}">
                  <span class="cup-ic">☕</span>
                  <span class="size-name">${esc(s.name)}</span>
                  ${s.extra ? `<span class="size-plus">+${money(s.extra)}</span>` : ''}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="card-actions-row" style="margin-top:12px">
          <div class="dark-pill-stepper">
            <button data-q="-1">−</button>
            <span>${S.sel.qty}</span>
            <button data-q="1">+</button>
          </div>
          <button class="white-add-btn" data-act="addsel" ${it.isAvailable && S.settings.acceptingOrders ? '' : 'disabled'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span>Add to Order</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Item Details View (Mobile) ---------- */
function viewDetail() {
  const it = S.detail;
  if (!it) return viewMenu();
  return `
    ${topbar()}
    <div style="padding:4px 0 24px">
      ${heroItemCardHtml(it, false)}
    </div>
  `;
}

/* ---------- Item Details Modal (Desktop PC) ---------- */
function renderDetailModal() {
  const it = S.detailModal;
  if (!it) return;

  const existing = $('#detailModalOverlay');
  if (existing) existing.remove();

  const ov = document.createElement('div');
  ov.id = 'detailModalOverlay';
  ov.className = 'overlay';
  ov.innerHTML = `
    <div style="max-width:440px;width:100%">
      ${heroItemCardHtml(it, true)}
    </div>
  `;
  document.body.appendChild(ov);
}

/* ---------- Cart View (Mobile) ---------- */
function viewCart() {
  const n = cartCount();
  return `
    ${topbar()}
    <section class="card">
      <div class="nav">
        <button class="icon-btn" data-act="back" aria-label="Back">←</button>
        <h2>Your order${S.table ? ` · Table ${S.table}` : ''}</h2>
        <span style="width:42px"></span>
      </div>

      ${n ? `
        ${S.cart.map((l, idx) => {
          const it = item(l.id);
          if (!it) return '';
          return `
            <div class="line">
              ${thumb(it)}
              <div class="meta">
                <b>${esc(it.name)}${l.size ? ` <small>(${esc(l.size)})</small>` : ''}</b>
                <small>${money(unit(l))} each</small>
              </div>
              <div class="stepper">
                <button data-line="${idx}" data-d="-1">−</button>
                <span>${l.qty}</span>
                <button data-line="${idx}" data-d="1">+</button>
              </div>
            </div>
          `;
        }).join('')}

        <textarea class="note" id="note" rows="2" maxlength="300" placeholder="Note: for the kitchen: less sugar, extra hot...">${esc(S.note)}</textarea>

        <div class="label">Payment</div>
        <div class="pay">
          <button data-pay="counter" class="${S.pay === 'counter' ? 'on' : ''}">💵 Pay at counter</button>
          <button data-pay="upi" class="${S.pay === 'upi' ? 'on' : ''}">📲 Pay by UPI</button>
        </div>

        <div class="totals">
          <div><span>Subtotal</span><span>${money(subtotal())}</span></div>
          <div><span>Tax (${S.settings.taxPercent || 5}%)</span><span>${money(tax())}</span></div>
          <div class="grand"><span>Total</span><span>${money(subtotal() + tax())}</span></div>
        </div>

        <button class="btn primary block" data-act="place" ${S.placing || !S.settings.acceptingOrders ? 'disabled' : ''}>
          ${S.placing ? 'Placing order…' : `Place order · ${money(subtotal() + tax())}`}
        </button>
      ` : `
        <div class="empty">
          <div style="font-size:42px;margin-bottom:10px">☕</div>
          Your cart is empty.<br><br>
          <button class="btn primary" data-act="back">Browse the menu</button>
        </div>
      `}
    </section>
  `;
}

/* ---------- Order Status View ---------- */
const STEPS = [
  ['new', 'Received', 'The café has your order'],
  ['preparing', 'Preparing', 'Your drink and food are being made'],
  ['ready', 'Ready', 'Coming to your table'],
  ['served', 'Served', 'Enjoy!']
];

function renderStatusCardInner(o) {
  const idx = STEPS.findIndex((s) => s[0] === o.status);
  const ago = Math.max(0, Math.round((Date.now() - new Date(o.createdAt)) / 60000));

  return `
    <section class="card">
      <div class="nav" style="margin-bottom:6px">
        <span class="eyebrow">4. ORDER STATUS</span>
        <span class="pill" style="font-size:13px">Table ${o.table}</span>
      </div>

      <div class="otop">
        <h2>Order #${o.number}</h2>
      </div>
      <p class="sub">${ago < 1 ? 'Placed just now' : `Placed ${ago} min ago`}</p>

      ${o.status === 'rejected' ? `
        <div class="banner bad">
          Sorry, this order couldn’t be accepted${o.history?.at(-1)?.reason ? ` — ${esc(o.history.at(-1).reason)}` : ''}. Please speak to our staff.
        </div>
      ` : `
        <ol class="steps">
          ${STEPS.map((s, i) => `
            <li class="${i < idx || o.status === 'served' ? 'done' : i === idx ? 'now' : ''}">
              <span class="dot">${i < idx || o.status === 'served' ? '✓' : ''}</span>
              <div>
                <b>${s[1]}</b>
                <small>${s[2]}</small>
              </div>
            </li>
          `).join('')}
        </ol>
      `}

      <div class="summary">
        ${o.items.map((l) => `
          <div class="r">
            <span>${l.qty} × ${esc(l.name)}${l.size ? ` (${esc(l.size)})` : ''}</span>
            <span>${money(l.qty * l.unitPrice)}</span>
          </div>
        `).join('')}
        ${o.note ? `<div class="r" style="color:var(--muted)"><span>Note: ${esc(o.note)}</span></div>` : ''}
        <div class="r"><span>Tax (${o.taxPercent}%)</span><span>${money(o.tax)}</span></div>
        <div class="r t"><span>Total</span><span>${money(o.total)}</span></div>
        <div class="r" style="color:var(--muted)">
          <span>Payment</span>
          <span>${o.paymentStatus === 'paid' ? '✅ Paid' : o.paymentMethod === 'upi' ? 'UPI – unpaid' : 'Pay at counter'}</span>
        </div>
      </div>

      <div class="actions">
        ${o.status === 'new' ? '<button class="btn danger" data-act="cancel">Cancel order</button>' : ''}
        <button class="btn ghost block" data-act="more">↻ Order more</button>
      </div>
    </section>
  `;
}

function viewStatus() {
  const o = S.order;
  if (!o) {
    return `
      ${topbar()}
      <section class="card">
        <div class="empty">
          No active order.<br><br>
          <button class="btn primary" data-act="back">Go to menu</button>
        </div>
      </section>
    `;
  }
  return `
    ${topbar()}
    <div style="max-width:540px;margin:0 auto">
      ${renderStatusCardInner(o)}
    </div>
  `;
}

/* ---------- Events & Interactions ---------- */
function bind() {
  const searchInput = $('#menuSearch');

  if (searchInput) {
    searchInput.oninput = (e) => {
      S.searchQuery = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const nextInput = $('#menuSearch');
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(pos, pos);
      }
    };
  }

  // Global click delegate
  document.body.onclick = async (e) => {
    const t = e.target.closest('[data-cat],[data-open],[data-quick],[data-act],[data-size],[data-q],[data-line],[data-pay],[data-like],[data-card-q],[data-cardsel-size],[data-card-add]');
    if (!t) return;
    const d = t.dataset;

    if (d.cardQ) {
      e.stopPropagation();
      const id = d.forItem;
      const cur = S.cardQty[id] || 1;
      S.cardQty[id] = Math.min(20, Math.max(1, cur + +d.cardQ));
      return render();
    }

    if (d.cardselSize) {
      e.stopPropagation();
      const id = d.forItem;
      S.cardSize[id] = d.cardselSize;
      return render();
    }

    if (d.cardAdd) {
      e.stopPropagation();
      const it = item(d.cardAdd);
      if (!it || !it.isAvailable) return toast(it ? it.name + ' is out of stock' : 'Unavailable', true);
      const chosenSize = S.cardSize[it.id] || (it.sizes?.[0]?.name || '');
      const qty = S.cardQty[it.id] || 1;
      addToCart(it, chosenSize, qty);
      return toast(`Added ${qty}x ${it.name} to cart! 🛍️`);
    }

    if (d.like) {
      e.stopPropagation();
      const id = d.like;
      if (S.favs.includes(id)) {
        S.favs = S.favs.filter((x) => x !== id);
        toast('Removed from favorites');
      } else {
        S.favs.push(id);
        toast('Added to favorites! ❤️');
      }
      store.set('favs', S.favs);
      render();
      return;
    }

    if (d.cat) {
      S.cat = d.cat;
      return render();
    }

    if (d.quick) {
      e.stopPropagation();
      const it = item(d.quick);
      if (!it.isAvailable) return toast(it.name + ' is out of stock', true);
      if (it.sizes?.length) return openDetail(it);
      addToCart(it, '', 1);
      return toast(`${it.name} added to cart!`);
    }

    if (d.open) {
      return openDetail(item(d.open));
    }

    if (d.size) {
      S.sel.size = d.size;
      return render();
    }

    if (d.q) {
      S.sel.qty = Math.min(20, Math.max(1, S.sel.qty + +d.q));
      return render();
    }

    if (d.pay) {
      S.note = $('#note')?.value ?? S.note;
      S.pay = d.pay;
      return render();
    }

    if (d.line !== undefined) {
      S.note = $('#note')?.value ?? S.note;
      const l = S.cart[+d.line];
      l.qty += +d.d;
      if (l.qty < 1) S.cart.splice(+d.line, 1);
      else l.qty = Math.min(20, l.qty);
      saveCart();
      return render();
    }

    switch (d.act) {
      case 'toggleveg':
        S.vegOnly = !S.vegOnly;
        return render();
      case 'changetable':
        return askTable();
      case 'closemodal':
        S.detailModal = null;
        const ov = $('#detailModalOverlay');
        if (ov) ov.remove();
        return;
      case 'back':
        return go('menu');
      case 'cart':
        S.detailModal = null;
        const modalEl = $('#detailModalOverlay');
        if (modalEl) modalEl.remove();
        return go('cart');
      case 'track':
        return go('status');
      case 'addsel': {
        const targetItem = isDesktop() ? S.detailModal : S.detail;
        if (!targetItem) return;
        addToCart(targetItem, S.sel.size, S.sel.qty);
        toast(`Added ${S.sel.qty}x ${targetItem.name} to cart! 🛍️`);
        S.detailModal = null;
        const m = $('#detailModalOverlay');
        if (m) m.remove();
        if (!isDesktop()) go('menu');
        else render();
        return;
      }
      case 'place':
        return place();
      case 'more':
        S.order = null;
        return go('menu');
      case 'cancel':
        if (!confirm('Cancel this order?')) return;
        try {
          S.order = await api(`/api/orders/${S.order.id}/cancel`, { method: 'POST' });
          render();
          toast('Order cancelled');
        } catch (err) {
          toast(err.message, true);
        }
        return;
    }
  };
}

function openDetail(it) {
  if (!it) return;
  S.sel = { size: it.sizes?.[0]?.name || '', qty: 1 };
  if (isDesktop()) {
    S.detailModal = it;
    renderDetailModal();
  } else {
    S.detail = it;
    go('detail');
  }
}

function addToCart(it, size, qty) {
  const chosenSize = size || (it.sizes?.[0]?.name || '');
  const ex = S.cart.find((l) => l.id === it.id && l.size === chosenSize);
  if (ex) ex.qty = Math.min(20, ex.qty + qty);
  else S.cart.push({ id: it.id, size: chosenSize, qty });
  saveCart();
  render();
}

async function place() {
  if (!S.table) return askTable();
  S.note = $('#note')?.value ?? S.note;
  S.placing = true;
  render();

  try {
    const o = await api('/api/orders', {
      method: 'POST',
      body: { table: S.table, items: S.cart, note: S.note, paymentMethod: S.pay }
    });
    S.order = o;
    S.orderId = o.id;
    store.set('orderId', o.id);
    S.cart = [];
    S.note = '';
    saveCart();
    reconnect();
    S.placing = false;
    toast(`Order #${o.number} placed successfully!`);
    go(isDesktop() ? 'menu' : 'status');
  } catch (e) {
    S.placing = false;
    render();
    toast(e.message, true);
  }
}

window.addEventListener('resize', () => {
  render();
});

setInterval(async () => {
  if (S.orderId && (S.screen === 'status' || isDesktop())) {
    try {
      S.order = await api('/api/orders/' + S.orderId);
      render();
    } catch {}
  }
}, 25000);

boot();
