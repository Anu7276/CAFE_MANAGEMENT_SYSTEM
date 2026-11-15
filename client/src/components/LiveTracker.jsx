import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Utensils, Smile, ShieldCheck } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import api from '../api/client';

const STEPS = [
  { key: 'new', label: 'Received', desc: 'The café has received your order', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', desc: 'Handcrafted hot & fresh by our baristas', icon: Utensils },
  { key: 'ready', label: 'Ready', desc: 'On its way to your table right now', icon: Clock },
  { key: 'served', label: 'Served', desc: 'Enjoy your food and coffee!', icon: Smile }
];

export default function LiveTracker({ orderId, orderToken, initialOrder, onOrderMore }) {
  const socket = useSocket();
  const [order, setOrder] = useState(initialOrder || null);
  const token = orderToken || initialOrder?.orderToken || orderId;

  useEffect(() => {
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

    if (token && !order) {
      fetchOrder();
    }
  }, [token]);

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
          updatedAt: payload.updatedAt
        }));
      }
    };

    socket.on('order:status', handleStatusUpdate);

    return () => {
      socket.off('order:status', handleStatusUpdate);
    };
  }, [socket, token, orderId]);

  if (!order) {
    return (
      <div className="w-full max-w-[420px] mx-auto p-6 bg-[#0c241b] rounded-3xl border border-white/10 text-center text-white/50 animate-pulse">
        Connecting to live order tracker...
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === order.status);

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
              Live Order Status
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
        {STEPS.map((step, idx) => {
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

      {/* Ordered items brief */}
      {order.items && order.items.length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2">
            Items in this order
          </div>
          <div className="space-y-1.5 text-xs text-white/80">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span>{item.qty}x {item.name} {item.size ? `(${item.size})` : ''}</span>
                <span className="font-semibold text-white">₹{item.price * item.qty}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2 border-t border-white/10 font-bold text-white">
              <span>Total Amount</span>
              <span className="text-mintGreen text-sm">₹{order.total}</span>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onOrderMore}
        className="w-full mt-6 h-11 rounded-full border border-white/20 text-white text-xs font-bold hover:bg-white/10 transition"
      >
        Place Another Order
      </button>
    </motion.div>
  );
}
