import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('emerald_cart');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [table, setTable] = useState(() => {
    const pathMatch = window.location.pathname.match(/\/t\/(\d+)/);
    if (pathMatch) {
      localStorage.setItem('emerald_table', pathMatch[1]);
      return Number(pathMatch[1]);
    }
    const params = new URLSearchParams(window.location.search);
    const tableParam = params.get('table');
    if (tableParam) {
      localStorage.setItem('emerald_table', tableParam);
      return Number(tableParam);
    }
    const saved = localStorage.getItem('emerald_table');
    return saved ? Number(saved) : 1;
  });

  const [tableSig, setTableSig] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const sigParam = params.get('sig');
    if (sigParam) {
      localStorage.setItem('emerald_table_sig', sigParam);
      return sigParam;
    }
    return localStorage.getItem('emerald_table_sig') || '';
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

  const safeCart = Array.isArray(cart) ? cart : [];
  const cartCount = safeCart.reduce((acc, i) => acc + (Number(i.qty) || 0), 0);
  const subtotal = safeCart.reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  return (
    <CartContext.Provider
      value={{
        cart,
        table,
        setTable,
        tableSig,
        setTableSig,
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
