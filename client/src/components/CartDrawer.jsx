import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Minus, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useI18n } from '../context/I18nContext';
import api from '../api/client';

export default function CartDrawer({ isOpen, onClose, onOrderPlaced }) {
  const { cart, table, tableSig, updateQty, clearCart, subtotal, tax, total } = useCart();
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('counter');
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!cart.length || loading) return;
    setLoading(true);

    try {
      // Generate a unique idempotency key for this checkout attempt
      const idempotencyKey = 'idemp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

      const res = await api.post(
        '/orders',
        {
          table,
          tableSig,
          items: cart.map((c) => ({
            itemId: c.id,
            name: c.name,
            size: c.size,
            qty: c.qty
          })),
          note,
          paymentMethod
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
            ...(tableSig ? { 'X-Table-Sig': tableSig } : {})
          }
        }
      );

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
              <h2 className="text-xl font-extrabold text-white">{t('yourOrder')}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-mintGreen font-semibold">{t('table')} {table}</span>
                {tableSig && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emeraldDark/80 text-mintGreen border border-mintGreen/30">
                    <ShieldCheck className="w-3 h-3" /> Verified QR
                  </span>
                )}
              </div>
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
              <div className="text-center py-10 text-white/50 text-sm">{t('cartEmpty')}</div>
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

          {/* Kitchen / Barista Note */}
          {cart.length > 0 && (
            <div className="mt-4">
              <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider block mb-1">
                {t('specialNote')}
              </label>
              <input
                type="text"
                placeholder="e.g. Oat milk, extra hot, less sugar..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-mintGreen"
              />
            </div>
          )}
        </div>

        {/* Footer & Checkout */}
        <div className="pt-4 border-t border-white/10">
          <div className="space-y-1 mb-4 text-xs">
            <div className="flex justify-between text-white/60">
              <span>{t('subtotal')}</span>
              <span>₹{subtotal}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>{t('gstTax')}</span>
              <span>₹{tax}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-white/5">
              <span>{t('totalPayable')}</span>
              <span className="text-mintGreen text-base">₹{total}</span>
            </div>
          </div>

          <button
            disabled={!cart.length || loading}
            onClick={handleCheckout}
            className={`w-full h-12 rounded-full font-bold flex items-center justify-center gap-2 transition ${
              cart.length && !loading
                ? 'bg-mintGreen text-emeraldDark hover:bg-[#88e7bd] shadow-lg shadow-mintGreen/20'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span className="animate-pulse">Securing & Placing Order...</span>
            ) : (
              <>
                <span>{t('placeOrder')} · ₹{total}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
