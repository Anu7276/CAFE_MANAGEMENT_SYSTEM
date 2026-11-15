import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('emerald_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [table, setTable] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('table') ? Number(params.get('table')) : 1;
  });

  useEffect(() => {
    localStorage.setItem('emerald_cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (item, size = '', qty = 1) => {
    setCart((prev) => {
      const chosenSize = size || (item.sizes?.[0]?.name || '');
      const existingIndex = prev.findIndex((i) => i.id === item._id && i.size === chosenSize);

      const sizeExtra = item.sizes?.find((s) => s.name === chosenSize)?.extra || 0;
      const unitPrice = item.price + sizeExtra;

      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex].qty += qty;
        return next;
      }

      return [
        ...prev,
        {
          id: item._id,
          name: item.name,
          image: item.image,
          price: unitPrice,
          size: chosenSize,
          qty
        }
      ];
    });
  };

  const updateQty = (index, delta) => {
    setCart((prev) => {
      const next = [...prev];
      next[index].qty += delta;
      if (next[index].qty <= 0) {
        return next.filter((_, i) => i !== index);
      }
      return next;
    });
  };

  const clearCart = () => setCart([]);

  const cartCount = cart.reduce((acc, i) => acc + i.qty, 0);
  const subtotal = cart.reduce((acc, i) => acc + i.price * i.qty, 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  return (
    <CartContext.Provider
      value={{
        cart,
        table,
        setTable,
        addToCart,
        updateQty,
        clearCart,
        cartCount,
        subtotal,
        tax,
        total
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

