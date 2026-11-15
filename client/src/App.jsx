import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { SocketProvider } from './context/SocketContext';
import { I18nProvider } from './context/I18nContext';
import ErrorBoundary from './components/ErrorBoundary';
import UpdatePrompt from './components/UpdatePrompt';
import MenuPage from './pages/MenuPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import LegalPolicyPage from './pages/LegalPolicyPage';

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
                <Route path="/privacy" element={<LegalPolicyPage defaultTab="privacy" />} />
                <Route path="/terms" element={<LegalPolicyPage defaultTab="terms" />} />
                <Route path="/refunds" element={<LegalPolicyPage defaultTab="refunds" />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <UpdatePrompt />
            </BrowserRouter>
          </CartProvider>
        </SocketProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
