import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Utensils, Smile } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import api from '../api/client';

const STEPS = [
  { key: 'new', label: 'Received', desc: 'The café has received your order', icon: CheckCircle2 },
  { key: 'preparing', label: 'Preparing', desc: 'Handcrafted hot & fresh by our baristas', icon: Utensils },
  { key: 'ready', label: 'Ready', desc: 'On its way to your table right now', icon: Clock },
  { key: 'served', label: 'Served', desc: 'Enjoy your food and coffee!', icon: Smile }
];

export default function LiveTracker({ orderId, onOrderMore }) {
  const socket = useSocket();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await api.get(`/orders/${orderId}`);
        setOrder(res.data.data);
      } catch (err) {
        console.error(err);
      }
    };
    if (orderId) fetchOrder();
  }, [orderId]);

  useEffect(() => {
    if (!socket || !orderId) return;

    const handleStatusUpdate = (updatedOrder) => {
      if (updatedOrder._id === orderId) {
        setOrder(updatedOrder);
      }
    };

    socket.on(`order:${orderId}:status`, handleStatusUpdate);

    return () => {
      socket.off(`order:${orderId}:status`, handleStatusUpdate);
    };
  }, [socket, orderId]);

  if (!order) return null;

  const currentStepIndex = STEPS.findIndex((s) => s.key === order.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-[420px] mx-auto p-6 bg-[#0c241b] rounded-3xl border border-white/10 shadow-2xl"
    >
      <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
        <div>
          <span className="text-[11px] font-extrabold text-mintGreen tracking-wider uppercase block">
            Live Order Status
          </span>
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

      <button
        onClick={onOrderMore}
        className="w-full mt-8 h-11 rounded-full border border-white/20 text-white text-xs font-bold hover:bg-white/10 transition"
      >
        Order More Items
      </button>
    </motion.div>
  );
}

