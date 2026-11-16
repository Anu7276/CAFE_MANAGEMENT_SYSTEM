import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Utensils, Smile, ShieldCheck, QrCode, CreditCard, Receipt, Wifi, WifiOff } from 'lucide-react';
import { useSocketState } from '../context/SocketContext';
import { useI18n } from '../context/I18nContext';
import api from '../api/client';

const formatPrice = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export default function LiveTracker({ orderId, orderToken, initialOrder, onOrderMore }) {
  const { socket, isConnected, onReconnect } = useSocketState();
  const { t } = useI18n();
  const [order, setOrder] = useState(initialOrder || null);
  const [paying, setPaying] = useState(false);
  const [upiModal, setUpiModal] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const token = orderToken || initialOrder?.orderToken || orderId;

  const steps = [
    { key: 'new', label: t('orderReceived'), desc: t('orderReceivedDesc'), icon: CheckCircle2 },
    { key: 'preparing', label: t('orderPreparing'), desc: t('orderPreparingDesc'), icon: Utensils },
    { key: 'ready', label: t('orderReady'), desc: t('orderReadyDesc'), icon: Clock },
    { key: 'served', label: t('orderServed'), desc: t('orderServedDesc'), icon: Smile }
  ];

  const fetchOrder = async () => {
    try {
      if (orderToken) {
        const res = await api.get(`/orders/track/${orderToken}`);
        setOrder(res.data.data);
      } else if (orderId) {
        const res = await api.get(`/orders/${orderId}`);
        setOrder(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load order status:', err);
    }
  };

  useEffect(() => {
    if (token && !order) {
      fetchOrder();
    }
  }, [token]);

  // Auto-refetch on socket reconnection
  useEffect(() => {
    if (!onReconnect) return;
    const unsubscribe = onReconnect(() => {
      fetchOrder();
    });
    return unsubscribe;
  }, [onReconnect, token]);

  // Polling fallback when WebSocket disconnected
  useEffect(() => {
    if (isConnected || !token) return;
    if (order && (order.status === 'served' || order.status === 'rejected')) return;

    const interval = setInterval(() => {
      fetchOrder();
    }, 8000);
    return () => clearInterval(interval);
  }, [isConnected, token, order?.status]);

  useEffect(() => {
    if (!socket || !token) return;

    // Join private order room for secure real-time status pushes
    socket.emit('join:order', token);

    const handleStatusUpdate = (payload) => {
      if (payload.orderToken === token || payload._id === orderId) {
        setOrder((prev) => ({
          ...prev,
          status: payload.status,
          statusHistory: payload.statusHistory || prev?.statusHistory,
          paymentStatus: payload.paymentStatus || prev?.paymentStatus,
          paymentMethod: payload.paymentMethod || prev?.paymentMethod,
          updatedAt: payload.updatedAt
        }));
      }
    };

    socket.on('order:status', handleStatusUpdate);

    return () => {
      socket.off('order:status', handleStatusUpdate);
    };
  }, [socket, token, orderId]);

  const handleStartUpiPayment = async () => {
    setPaying(true);
    try {
      const res = await api.post('/payments/razorpay/create-order', {
        orderToken: order.orderToken,
        orderId: order._id
      });

      if (res.data.success) {
        setPaymentData(res.data.data);
        setUpiModal(true);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to initiate UPI checkout');
    } finally {
      setPaying(false);
    }
  };

  const handleConfirmUpiPaid = async () => {
    try {
      // Complete signature verification
      const verifyRes = await api.post('/payments/razorpay/verify', {
        razorpayOrderId: paymentData.razorpayOrderId,
        razorpayPaymentId: 'pay_' + Date.now(),
        razorpaySignature: 'sim_verified_sig',
        orderToken: order.orderToken
      });

      if (verifyRes.data.success) {
        setOrder((prev) => ({
          ...prev,
          paymentStatus: 'paid',
          paymentMethod: 'upi'
        }));
        setUpiModal(false);
      }
    } catch (err) {
      alert('Payment confirmation failed');
    }
  };

  if (!order) {
    return (
      <div className="w-full max-w-[420px] mx-auto p-6 bg-[#0c241b] rounded-3xl border border-white/10 text-center text-white/50 animate-pulse">
        Connecting to live order tracker...
      </div>
    );
  }

  const currentStepIndex = steps.findIndex((s) => s.key === order.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[420px] mx-auto p-6 bg-[#0c241b] rounded-3xl border border-white/10 shadow-2xl"
    >
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-extrabold text-mintGreen tracking-wider uppercase block">
              {t('liveStatus')}
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-mintGreen" />
          </div>
          <h2 className="text-xl font-extrabold text-white">Order #{order.orderNumber}</h2>
        </div>
        <span className="px-3 py-1 bg-white/10 text-white rounded-full text-xs font-bold">
          Table {order.table}
        </span>
      </div>

      {/* Step Tracker Timeline */}
      <div className="space-y-6 relative before:absolute before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-white/15">
        {steps.map((step, idx) => {
          const isDone = currentStepIndex >= idx;
          const isCurrent = currentStepIndex === idx;
          const Icon = step.icon;

          return (
            <div key={step.key} className="relative flex items-start gap-4">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center z-10 transition ${
                  isDone
                    ? 'bg-mintGreen text-emeraldDark ring-4 ring-mintGreen/20'
                    : 'bg-black/60 text-white/40 border border-white/20'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className={`text-sm font-bold ${isCurrent ? 'text-mintGreen' : isDone ? 'text-white' : 'text-white/40'}`}>
                  {step.label}
                </h4>
                <p className="text-xs text-white/60">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legal GST & Tax Invoice Breakdown */}
      {order.items && order.items.length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider">
              GST Tax Invoice
            </span>
            <span className="text-[10px] text-mintGreen font-semibold">SAC 996331</span>
          </div>

          <div className="space-y-1.5 text-xs text-white/80 mb-3">
            {(order.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span>{item.qty}x {item.name} {item.size ? `(${item.size})` : ''}</span>
                <span className="font-semibold text-white">₹{item.price * item.qty}</span>
              </div>
            ))}
          </div>

          {/* Tax Breakdown */}
          <div className="space-y-1 pt-2 border-t border-white/5 text-[11px] text-white/60">
            <div className="flex justify-between">
              <span>Item Subtotal</span>
              <span>₹{order.subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span>CGST (2.5%)</span>
              <span>₹{order.cgst || Math.round(order.tax / 2)}</span>
            </div>
            <div className="flex justify-between">
              <span>SGST (2.5%)</span>
              <span>₹{order.sgst || Math.round(order.tax / 2)}</span>
            </div>
            <div className="flex justify-between font-bold text-white text-xs pt-1 border-t border-white/5">
              <span>Grand Total</span>
              <span className="text-mintGreen text-sm">₹{order.total}</span>
            </div>
          </div>

          {/* Legal Compliance Numbers */}
          <div className="mt-3 p-2 rounded-xl bg-black/30 border border-white/5 text-[9px] text-white/40 space-y-0.5">
            {(order.gstin || order.fssai) ? (
              <div>{order.gstin ? `GSTIN: ${order.gstin}` : ''} {order.fssai ? `| FSSAI: ${order.fssai}` : ''}</div>
            ) : null}
            <div>Invoice Ref: INV-EMR-{order.orderNumber}</div>
          </div>

          {/* Payment Section */}
          <div className="mt-4 pt-3 border-t border-white/10">
            {order.paymentStatus === 'paid' ? (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <span className="font-bold text-emerald-300">
                  {t('paidSettled')} ({order.paymentMethod?.toUpperCase() || 'UPI'})
                </span>
                <span className="text-mintGreen font-bold">₹{formatPrice(order.total)}</span>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleStartUpiPayment}
                  disabled={paying}
                  className="w-full h-11 rounded-2xl bg-mintGreen text-[#071a12] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#88e7bd] transition shadow-lg shadow-mintGreen/20 disabled:opacity-50"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{paying ? 'Connecting Gateway...' : `${t('payUpi')} (₹${formatPrice(order.total)})`}</span>
                </button>
                <div className="text-center text-[10px] text-white/50">
                  {t('payCounter')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={onOrderMore}
        className="w-full mt-4 h-10 rounded-full border border-white/20 text-white text-xs font-bold hover:bg-white/10 transition"
      >
        {t('orderMore')}
      </button>

      {/* UPI Checkout Modal Portal */}
      {upiModal && paymentData && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0b241a] border border-white/20 rounded-3xl p-6 text-center w-full max-w-[340px] shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative z-[10000]">
            <h3 className="text-base font-extrabold text-white mb-1">UPI Instant Checkout</h3>
            <p className="text-xs text-mintGreen font-semibold mb-4">Café Emerald Table {order.table}</p>
            
            <div className="bg-white p-4 rounded-2xl shadow-inner mb-4 inline-block">
              {/* UPI QR Code representation */}
              <div className="w-44 h-44 bg-gray-100 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-2">
                <span className="text-3xl mb-1">📱</span>
                <span className="text-[10px] font-bold text-gray-800 uppercase tracking-wider">UPI / GPay / Paytm</span>
                <span className="text-[9px] text-gray-500 font-mono mt-1">emeraldcafe@upi</span>
                <div className="mt-2 text-sm font-extrabold text-[#071a12]">₹{formatPrice(order.total)}</div>
              </div>
            </div>

            <div className="text-xs text-white/70 mb-4">
              Razorpay Order ID: <code className="font-mono text-[10px] text-mintGreen">{paymentData.razorpayOrderId.slice(0, 15)}...</code>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConfirmUpiPaid}
                className="flex-1 py-3 rounded-xl bg-mintGreen text-[#071a12] font-bold text-xs hover:bg-[#88e7bd] transition shadow-lg shadow-mintGreen/20 active:scale-95"
              >
                Simulate Successful Pay
              </button>
              <button
                onClick={() => setUpiModal(false)}
                className="px-4 py-3 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/20 transition active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
}
