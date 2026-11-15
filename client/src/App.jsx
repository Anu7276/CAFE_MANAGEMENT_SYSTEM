import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { SocketProvider } from './context/SocketContext';
import MenuPage from './pages/MenuPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

export default function App() {
  return (
    <SocketProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<MenuPage />} />
            <Route path="/t/:tableNumber" element={<MenuPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </SocketProvider>
  );
}

