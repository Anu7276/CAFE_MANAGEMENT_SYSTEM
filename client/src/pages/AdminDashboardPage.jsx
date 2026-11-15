import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import api from '../api/client';
import { Clock, CheckCircle2, AlertCircle, LogOut } from 'lucide-react';

const COLUMNS = [
  { key: 'new', label: 'New Orders (2)', color: 'border-amber-500' },
  { key: 'preparing', label: 'In Kitchen (1)', color: 'border-blue-500' },
  { key: 'ready', label: 'Ready for Table (1)', color: 'border-emerald-500' }
];

export default function AdminDashboardPage() {
  const socket = useSocket();
  const [orders, setOrders] = useState([]);

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('order:created', (newOrder) => {
      setOrders((prev) => [newOrder, ...prev]);
    });

    socket.on('order:updated', (updatedOrder) => {
      setOrders((prev) => prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o)));
    });

    return () => {
      socket.off('order:created');
      socket.off('order:updated');
    };
  }, [socket]);

  const updateStatus = async (orderId, newStatus) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
    } catch (err) {
      alert('Error updating order');
    }
  };

  return (
    <div className="min-h-screen bg-[#06140e] text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">KDS Kitchen Live Orders</h1>
          <span className="text-xs text-mintGreen font-semibold">Real-time WebSocket dispatcher</span>
        </div>
        <button
          onClick={() => {
            window.location.href = '/?table=1';
          }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 text-xs font-bold hover:bg-white/20 transition"
        >
          Customer View
        </button>
      </div>

      {/* Kanban Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.key);

          return (
            <div key={col.key} className="bg-[#0b241a] rounded-3xl p-5 border border-white/10 flex flex-col h-[80vh]">
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
                <h3 className="font-bold text-sm tracking-wide">{col.label.split('(')[0]}</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-bold">
                  {colOrders.length}
                </span>
              </div>

              <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                {colOrders.map((order) => (
                  <div
                    key={order._id}
                    className="p-4 rounded-2xl bg-black/40 border border-white/10 shadow-md space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-extrabold text-white">#{order.orderNumber}</span>
                      <span className="px-2.5 py-1 rounded-full bg-mintGreen/20 text-mintGreen text-xs font-extrabold">
                        Table {order.table}
                      </span>
                    </div>

                    <div className="space-y-1 py-1 border-y border-white/5 text-xs text-white/80">
                      {order.items.map((i, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {i.qty}x {i.name} {i.size ? `(${i.size})` : ''}
                          </span>
                          <span className="font-semibold">₹{i.price * i.qty}</span>
                        </div>
                      ))}
                    </div>

                    {order.note && (
                      <p className="text-[11px] text-amber-300 italic bg-amber-500/10 p-2 rounded-lg">
                        Note: {order.note}
                      </p>
                    )}

                    <div className="flex gap-2 pt-2">
                      {col.key === 'new' && (
                        <button
                          onClick={() => updateStatus(order._id, 'preparing')}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold transition active:scale-95"
                        >
                          Accept & Prepare
                        </button>
                      )}
                      {col.key === 'preparing' && (
                        <button
                          onClick={() => updateStatus(order._id, 'ready')}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold transition active:scale-95"
                        >
                          Mark Ready
                        </button>
                      )}
                      {col.key === 'ready' && (
                        <button
                          onClick={() => updateStatus(order._id, 'served')}
                          className="w-full py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold transition active:scale-95"
                        >
                          Mark Served
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

