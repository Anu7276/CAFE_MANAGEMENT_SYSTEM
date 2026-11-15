import React, { useState, useEffect } from 'react';
import { Search, ShoppingBag } from 'lucide-react';
import api from '../api/client';
import { useCart } from '../context/CartContext';
import DishCard from '../components/DishCard';
import DetailModal from '../components/DetailModal';
import CartDrawer from '../components/CartDrawer';
import LiveTracker from '../components/LiveTracker';

export default function MenuPage() {
  const { table, cartCount } = useCart();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCat, setSelectedCat] = useState('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [modalItem, setModalItem] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
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
      try {
        const res = await api.get('/items', {
          params: { category: selectedCat, search, vegOnly }
        });
        setItems(res.data.data);
        setCategories(res.data.categories);
      } catch (err) {
        console.error(err);
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
              <h1 className="text-lg font-extrabold tracking-tight">CAFÉ EMERALD</h1>
              <span className="text-[11px] text-white/70 block -mt-0.5">Table {table} · Table Ordering</span>
            </div>
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className="flex items-center gap-2 bg-white text-[#0c2f21] px-4 py-2 rounded-full font-extrabold text-xs shadow-lg hover:bg-slate-100 transition active:scale-95"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Cart ({cartCount})</span>
          </button>
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
                  placeholder="Search coffee, drinks, snacks..."
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
                Veg Only
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
                🍽️ All Items
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setSelectedCat(c.slug)}
                  className={`px-4 py-2 rounded-full text-xs font-extrabold whitespace-nowrap transition ${
                    selectedCat === c.slug
                      ? 'bg-mintGreen text-[#0c2f21] shadow-md'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>

            {/* Compact 210px–250px Card Grid matching user reference */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {items.map((item) => (
                <DishCard key={item._id} item={item} onOpenDetail={setModalItem} />
              ))}
            </div>
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
                <h3 className="text-base font-bold text-white mb-1">Your Order Table {table}</h3>
                <p className="text-xs text-white/60 mb-4">
                  {cartCount > 0 ? `${cartCount} items in cart ready for checkout` : 'Select items from the menu to start order'}
                </p>
                <button
                  onClick={() => setCartOpen(true)}
                  className="w-full py-2.5 rounded-full bg-mintGreen text-[#0c2f21] font-extrabold text-xs shadow-md hover:bg-emerald-400 transition"
                >
                  {cartCount > 0 ? `Review & Checkout (${cartCount})` : 'Open Cart'}
                </button>
              </div>
            )}
          </div>
        </div>
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

