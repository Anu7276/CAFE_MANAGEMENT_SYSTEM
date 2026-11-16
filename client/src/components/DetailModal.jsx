import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, ShoppingBag, Plus, Minus, Coffee } from 'lucide-react';
import { useCart } from '../context/CartContext';

export default function DetailModal({ item, onClose }) {
  const { addToCart } = useCart();
  const [selectedSize, setSelectedSize] = useState(item.sizes?.[0]?.name || '');
  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);
  const [imgError, setImgError] = useState(false);

  const sizeExtra = item.sizes?.find((s) => s.name === selectedSize)?.extra || 0;
  const currentTotal = (item.price + sizeExtra) * qty;

  const handleAdd = () => {
    addToCart(item, selectedSize, qty);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-[380px] rounded-3xl overflow-hidden bg-[#0a1e16] border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col"
        >
          {/* Hero Image or Fallback */}
          <div className="relative h-[220px] w-full bg-gradient-to-br from-[#0e2a1e] via-[#091f16] to-[#04110b] flex items-center justify-center">
            <span className="text-6xl select-none">{item.emoji || '🍽️'}</span>
            {!imgError && item.image && (
              <img
                src={item.image}
                alt=""
                onError={() => setImgError(true)}
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a1e16] via-transparent to-black/40 pointer-events-none" />

            {/* Top Close & Heart */}
            <div className="absolute top-3 inset-x-3 flex items-center justify-between">
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLiked(!liked)}
                className={`w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center ${
                  liked ? 'text-coralRed' : 'text-white'
                }`}
              >
                <Heart className={`w-4 h-4 ${liked ? 'fill-coralRed' : ''}`} />
              </button>
            </div>
          </div>

          {/* Details Body */}
          <div className="p-5 flex flex-col gap-4">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xl font-extrabold text-white">{item.name}</h2>
                <span className="text-xl font-extrabold text-coralRed">₹{item.price + sizeExtra}</span>
              </div>
              <p className="text-xs text-white/70 mt-1 leading-relaxed">{item.description}</p>
            </div>

            {/* Size Options (Tall, Grande, Venti) */}
            {item.sizes?.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider block mb-2">
                  Size Options
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(item.sizes || []).map((s) => (
                    <button
                      key={s.name}
                      onClick={() => setSelectedSize(s.name)}
                      className={`p-2.5 rounded-2xl flex flex-col items-center justify-center border transition ${
                        selectedSize === s.name
                          ? 'bg-white text-emeraldDark border-white shadow-lg'
                          : 'bg-black/40 text-white border-white/15 hover:border-white/30'
                      }`}
                    >
                      <Coffee className="w-4 h-4 mb-1" />
                      <span className="text-xs font-bold">{s.name}</span>
                      {s.extra > 0 && <span className="text-[10px] opacity-75">+₹{s.extra}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stepper & Confirm Add Button */}
            <div className="flex items-center gap-3 mt-2">
              <div className="h-10 px-3 bg-black/60 border border-white/20 rounded-full flex items-center gap-3">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="text-white hover:text-mintGreen"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-white min-w-[16px] text-center">{qty}</span>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="text-white hover:text-mintGreen"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleAdd}
                className="flex-1 h-10 rounded-full bg-white text-emeraldDark font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg hover:bg-slate-100 active:scale-[0.98] transition"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Add to Order · ₹{currentTotal}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

