import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingBag, Globe } from 'lucide-react';
import api from '../api/client';
import { useCart } from '../context/CartContext';
import { useI18n } from '../context/I18nContext';
import DishCard from '../components/DishCard';
import DetailModal from '../components/DetailModal';
import CartDrawer from '../components/CartDrawer';
import LiveTracker from '../components/LiveTracker';

export default function MenuPage() {
  const { table, cartCount } = useCart();
  const { lang, changeLanguage, t } = useI18n();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [modalItem, setModalItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState(() => {
    try {
      const saved = sessionStorage.getItem('emerald_active_order');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeOrderId, setActiveOrderId] = useState(() => activeOrder?._id || null);
  const [activeOrderToken, setActiveOrderToken] = useState(() => activeOrder?.orderToken || null);

  const handleOrderPlaced = (order) => {
    setActiveOrder(order);
    setActiveOrderId(order._id);
    setActiveOrderToken(order.orderToken);
    try {
      sessionStorage.setItem('emerald_active_order', JSON.stringify(order));
    } catch (e) {}
  };

  const handleOrderMore = () => {
    setActiveOrder(null);
    setActiveOrderId(null);
    setActiveOrderToken(null);
    sessionStorage.removeItem('emerald_active_order');
  };

  useEffect(() => {
    const fetchMenu = async () => {
      setMenuLoading(true);
      try {
        const res = await api.get('/items', {
          params: { category: selectedCat, search, vegOnly }
        });
        setItems(Array.isArray(res.data?.data) ? res.data.data : []);
        setCategories(Array.isArray(res.data?.categories) ? res.data.categories : []);
      } catch (err) {
        console.error(err);
      } finally {
        setMenuLoading(false);
      }
    };
    fetchMenu();
  }, [selectedCat, search, vegOnly]);

  return (
    <div className="min-h-screen bg-[#071a12] text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-[#071a12]/90 backdrop-blur-md border-b border-white/10 px-6 py-4">
        <div className="max-w-[1380px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">☕</span>
            <div className="border-l border-white/20 pl-3">
              <h1 className="text-lg font-extrabold tracking-tight">{t('cafeTitle')}</h1>
              <span className="text-[11px] text-white/70 block -mt-0.5">{t('table')} {table} · {t('tableOrdering')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher Pill */}
            <div className="flex items-center bg-black/40 rounded-full p-0.5 border border-white/10 text-[10px] font-bold">
              <button
                onClick={() => changeLanguage('en')}
                className={`px-2 py-1 rounded-full transition ${lang === 'en' ? 'bg-mintGreen text-[#071a12]' : 'text-white/60 hover:text-white'}`}
                title="English"
              >
                EN
              </button>
              <button
                onClick={() => changeLanguage('hi')}
                className={`px-2 py-1 rounded-full transition ${lang === 'hi' ? 'bg-mintGreen text-[#071a12]' : 'text-white/60 hover:text-white'}`}
                title="हिन्दी"
              >
                हिं
              </button>
              <button
                onClick={() => changeLanguage('gu')}
                className={`px-2 py-1 rounded-full transition ${lang === 'gu' ? 'bg-mintGreen text-[#071a12]' : 'text-white/60 hover:text-white'}`}
                title="ગુજરાતી"
              >
                ગુજ
              </button>
            </div>

            <button
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-2 bg-white text-[#0c2f21] px-4 py-2 rounded-full font-extrabold text-xs shadow-lg hover:bg-slate-100 transition active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>{t('viewCart')} ({cartCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-[1380px] mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Left Column: Menu Catalog */}
          <div>
            <div className="mb-6">
              <span className="text-xs font-bold text-mintGreen uppercase tracking-wider block mb-1">
                1. MENU · TABLE {table}
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Smooth Out <span className="text-mintGreen italic font-serif">Your Everyday</span>
              </h2>
            </div>

            {/* Search & Veg Toggle */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-white/5 border border-white/15 rounded-full px-4 py-2">
                <Search className="w-4 h-4 text-white/50" />
                <input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-xs text-white placeholder-white/40 focus:outline-none w-full"
                />
              </div>

              <button
                onClick={() => setVegOnly(!vegOnly)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition ${
                  vegOnly ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white/5 border-white/15 text-white/70'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                {t('vegOnly')}
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-4">
              <button
                onClick={() => setSelectedCat('all')}
                className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition ${
                  selectedCat === 'all'
                    ? 'bg-mintGreen text-[#0c2f21] shadow-md'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                🍽️ {t('all')}
              </button>
              {(categories || []).map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setSelectedCat(c.slug)}
                  className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition ${
                    selectedCat === c.slug
                      ? 'bg-mintGreen text-[#0c2f21] shadow-md'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {c.emoji} {t(c.slug) || c.name}
                </button>
              ))}
            </div>

            {/* Loading Skeletons */}
            {menuLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-72 rounded-3xl bg-white/5 border border-white/5 p-4 flex flex-col justify-end animate-pulse"
                  >
                    <div className="h-4 bg-white/10 rounded-full w-3/4 mb-2" />
                    <div className="h-3 bg-white/10 rounded-full w-1/2 mb-4" />
                    <div className="h-8 bg-white/10 rounded-full w-full" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!menuLoading && items.length === 0 && (
              <div className="p-12 text-center rounded-3xl bg-[#0c241b] border border-white/10">
                <span className="text-4xl block mb-3">🔍</span>
                <h3 className="text-base font-bold text-white mb-1">No items found</h3>
                <p className="text-xs text-white/60 max-w-xs mx-auto">
                  {t('noItemsFound')}
                </p>
              </div>
            )}

            {/* Compact 210px–250px Card Grid matching user reference */}
            {!menuLoading && (items || []).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {(items || []).map((item) => (
                  <DishCard key={item._id} item={item} onOpenDetail={setModalItem} />
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Sticky Live Cart/Tracker (Desktop) */}
          <div className="hidden lg:block sticky top-24">
            {activeOrder || activeOrderId ? (
              <LiveTracker
                orderId={activeOrderId}
                orderToken={activeOrderToken}
                initialOrder={activeOrder}
                onOrderMore={handleOrderMore}
              />
            ) : (
              <div className="p-6 rounded-3xl bg-[#0c241b] border border-white/10 text-center">
                <span className="text-3xl block mb-2">🧾</span>
                <h3 className="text-base font-bold text-white mb-1">{t('yourOrder')} Table {table}</h3>
                <p className="text-xs text-white/60 mb-4">
                  {cartCount > 0 ? `${cartCount} ${t('itemsInCart')}` : t('cartEmpty')}
                </p>
                <button
                  onClick={() => setCartOpen(true)}
                  className="w-full py-2.5 rounded-full bg-mintGreen text-[#0c2f21] font-extrabold text-xs shadow-md hover:bg-emerald-400 transition"
                >
                  {cartCount > 0 ? `${t('reviewCheckout')} (${cartCount})` : t('openCart')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Customer Legal & Trust Footer */}
        <footer className="mt-16 border-t border-white/10 pt-8 pb-20 lg:pb-12 text-center text-xs text-white/50 space-y-4">
          <div className="flex flex-wrap justify-center items-center gap-6 text-white/70 font-medium">
            <Link to="/privacy" className="hover:text-mintGreen transition">Privacy Policy</Link>
            <span className="text-white/20">•</span>
            <Link to="/terms" className="hover:text-mintGreen transition">Terms of Service</Link>
            <span className="text-white/20">•</span>
            <Link to="/refunds" className="hover:text-mintGreen transition">Refund & Cancellation</Link>
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-white/80">Café Emerald — Artisanal Coffee & Gourmet Bakery</p>
            <p>GST Registered Food Services • SAC Code: 996331</p>
            <p>MG Road, Pune, Maharashtra 411001 • Contact: +91 98765 43210</p>
            <p className="text-[10px] text-white/30 pt-2">Secure digital payments processed via Razorpay (UPI, Cards & NetBanking)</p>
          </div>
        </footer>
      </main>

      {/* Floating Mobile Cart Bar */}
      {cartCount > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[#071a12] via-[#071a12]/95 to-transparent z-40">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full h-12 rounded-full bg-white text-[#0c2f21] font-extrabold text-sm flex items-center justify-between px-6 shadow-2xl active:scale-[0.98] transition"
          >
            <span>{cartCount} items in cart</span>
            <span className="flex items-center gap-1">
              View Cart <ShoppingBag className="w-4 h-4" />
            </span>
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {modalItem && <DetailModal item={modalItem} onClose={() => setModalItem(null)} />}

      {/* Slide-over Cart */}
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        onOrderPlaced={handleOrderPlaced}
      />
    </div>
  );
}

