import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, ShoppingBag, Plus, Minus } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useI18n } from '../context/I18nContext';

export default function DishCard({ item, onOpenDetail }) {
  const { addToCart } = useCart();
  const { t } = useI18n();
  const [qty, setQty] = useState(1);
  const [isLiked, setIsLiked] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleAdd = (e) => {
    e.stopPropagation();
    addToCart(item, '', qty);
    setQty(1);
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      onClick={() => onOpenDetail(item)}
      className="relative w-full aspect-[1/1.44] min-h-[290px] max-h-[350px] rounded-[22px] overflow-hidden bg-[#06160f] border border-white/10 shadow-[0_10px_26px_rgba(0,0,0,0.4)] flex flex-col justify-between cursor-pointer group select-none"
    >
      {/* 1. Full-Bleed Food Image or Fallback */}
      <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#0e2a1e] via-[#091f16] to-[#04110b] flex flex-col items-center justify-center text-5xl select-none z-0">
        <span>{item.emoji || '🍽️'}</span>
      </div>

      {!imgError && item.image && (
        <img
          src={item.image}
          alt=""
          loading="lazy"
          onError={() => setImgError(true)}
          className="absolute inset-0 w-full h-full object-cover object-[center_25%] transition-transform duration-500 group-hover:scale-105 z-0"
        />
      )}

      {/* 2. Floating Top Header */}
      <div className="relative z-10 flex items-center justify-between p-3">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-5 h-5 rounded-[5px] bg-white/95 flex items-center justify-center border ${
              item.isVeg ? 'border-emerald-600' : 'border-rose-600'
            } shadow`}
          >
            <span className={`w-2 h-2 rounded-full ${item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'}`} />
          </div>
          {item.sizes?.length > 0 && (
            <span className="bg-black/50 backdrop-blur-md text-[#e5fbf1] text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/20">
              Options
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsLiked(!isLiked);
            }}
            className={`w-[30px] h-[30px] rounded-full bg-black/45 backdrop-blur-md border border-white/25 flex items-center justify-center text-xs transition hover:scale-110 shadow ${
              isLiked ? 'text-coralRed border-coralRed/50' : 'text-white'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-coralRed' : ''}`} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail(item);
            }}
            className="w-[30px] h-[30px] rounded-full bg-black/45 backdrop-blur-md border border-white/25 flex items-center justify-center text-white text-xs transition hover:scale-110 shadow"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Bottom Scrim (Zero Fog Smear, Crisp Lighting) */}
      <div className="relative z-10 p-3 pt-6 rounded-b-[22px] bg-gradient-to-t from-[#030e09] via-[#030e09]/90 to-transparent">
        {/* 3-Dot Carousel Indicator */}
        <div className="flex items-center justify-center gap-1 mb-1">
          <span className="w-1 h-1 rounded-full bg-white/40" />
          <span className="w-2.5 h-1 rounded-full bg-white shadow-sm" />
          <span className="w-1 h-1 rounded-full bg-white/40" />
        </div>

        {/* Title & Coral-Red Price */}
        <div className="flex items-baseline justify-between gap-1.5 mb-0.5">
          <h3 className="text-[15px] font-bold text-white truncate group-hover:text-mintGreen transition">
            {item.name}
          </h3>
          <span className="text-[15.5px] font-extrabold text-coralRed whitespace-nowrap">
            ₹{item.price}
          </span>
        </div>

        {/* 2-Line Appetizing Description */}
        <p className="text-[11px] text-[#ebf8f0]/80 line-clamp-2 leading-tight mb-2.5 font-normal">
          {item.description}
        </p>

        {/* Action Controls: Compact Dark Stepper + White Add to Cart Pill */}
        <div className="flex items-center justify-between gap-2">
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-[30px] px-1.5 bg-black/65 border border-white/20 rounded-full flex items-center gap-1.5"
          >
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/20 active:scale-90"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-white text-xs font-bold min-w-[14px] text-center">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/20 active:scale-90"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={handleAdd}
            disabled={item.isAvailable === false}
            aria-label={`${item.isAvailable === false ? t('soldOut') : t('addToCart')} ${item.name}`}
            className={`flex-1 h-[30px] px-2.5 rounded-full text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md transition whitespace-nowrap ${
              item.isAvailable === false
                ? 'bg-red-500/20 text-coralRed border border-red-500/30 cursor-not-allowed'
                : 'bg-white text-[#0c2f21] hover:bg-[#f0f7f3] hover:-translate-y-0.5 active:translate-y-0'
            }`}
          >
            <ShoppingBag className="w-3 h-3" />
            <span>{item.isAvailable === false ? t('soldOut') : t('addToCart')}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

