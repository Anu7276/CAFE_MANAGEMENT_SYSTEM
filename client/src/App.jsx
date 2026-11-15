import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { SocketProvider } from './context/SocketContext';
import { I18nProvider } from './context/I18nContext';
import ErrorBoundary from './components/ErrorBoundary';
import MenuPage from './pages/MenuPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
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
      </I18nProvider>
    </ErrorBoundary>
  );
}
