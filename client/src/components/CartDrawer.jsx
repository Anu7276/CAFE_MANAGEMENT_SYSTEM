import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Minus, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import api from '../api/client';

export default function CartDrawer({ isOpen, onClose, onOrderPlaced }) {
  const { cart, table, updateQty, clearCart, subtotal, tax, total } = useCart();
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('counter');
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!cart.length) return;
    setLoading(true);

    try {
      const res = await api.post('/orders', {
        table,
        items: cart.map((c) => ({
          itemId: c.id,
          name: c.name,
          price: c.price,
          size: c.size,
          qty: c.qty
        })),
        note,
        paymentMethod
      });

      if (res.data.success) {
        clearCart();
        onClose();
        onOrderPlaced(res.data.data);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Error placing order');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-[420px] bg-[#0c241b] border-l border-white/10 h-full flex flex-col justify-between shadow-2xl p-6"
      >
        {/* Header */}
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h2 className="text-xl font-extrabold text-white">Your Order</h2>
              <span className="text-xs text-mintGreen font-semibold">Table {table}</span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="mt-4 flex flex-col gap-3 max-h-[45vh] overflow-y-auto pr-1">
            {!cart.length ? (
              <div className="text-center py-10 text-white/50 text-sm">Your cart is empty.</div>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={`${item.id}-${item.size}`}
                  className="flex items-center justify-between p-3 rounded-2xl bg-black/30 border border-white/5"
                >
                  <img src={item.image} alt={item.name} className="w-12 h-12 rounded-xl object-cover" />
                  <div className="flex-1 ml-3 min-w-0">
                    <h4 className="text-sm font-bold text-white truncate">{item.name}</h4>
                    <span className="text-[11px] text-white/60 block">
                      {item.size ? `${item.size} · ` : ''}₹{item.price} each
                    </span>
                  </div>

                  <div className="flex items-center gap-2 bg-black/40 rounded-full px-2 py-1 border border-white/10">
                    <button
                      onClick={() => updateQty(idx, -1)}
                      className="text-white hover:text-coralRed"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-bold text-white min-w-[12px] text-center">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(idx, 1)}
                      className="text-white hover:text-mintGreen"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Checkout Actions */}
        <div className="pt-4 border-t border-white/10">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Kitchen notes: e.g. Less sugar, extra hot..."
            className="w-full bg-black/40 border border-white/15 rounded-xl p-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:border-mintGreen mb-3"
          />

          {/* Payment Method Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setPaymentMethod('counter')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                paymentMethod === 'counter'
                  ? 'bg-mintGreen text-emeraldDark border-mintGreen'
                  : 'bg-black/30 text-white border-white/15'
              }`}
            >
              💵 Pay at Counter
            </button>
            <button
              onClick={() => setPaymentMethod('upi')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                paymentMethod === 'upi'
                  ? 'bg-mintGreen text-emeraldDark border-mintGreen'
                  : 'bg-black/30 text-white border-white/15'
              }`}
            >
              📱 UPI / QR
            </button>
          </div>

          {/* Price Breakdown */}
          <div className="space-y-1.5 text-xs text-white/70 mb-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-white">₹{subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxes (5%)</span>
              <span className="font-semibold text-white">₹{tax}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-white pt-2 border-t border-white/10">
              <span>Total</span>
              <span className="text-mintGreen font-extrabold">₹{total}</span>
            </div>
          </div>

          <button
            disabled={!cart.length || loading}
            onClick={handleCheckout}
            className="w-full h-12 rounded-full bg-white text-emeraldDark font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 disabled:opacity-50 transition shadow-lg active:scale-[0.98]"
          >
            {loading ? 'Submitting...' : `Place Order · ₹${total}`}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

