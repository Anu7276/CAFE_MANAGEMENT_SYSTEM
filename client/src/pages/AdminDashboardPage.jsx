import React, { useState, useEffect } from 'react';
import { useSocketState } from '../context/SocketContext';
import { playOrderChime, unlockAudio } from '../utils/audioChime';
import api from '../api/client';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  LogOut,
  UtensilsCrossed,
  QrCode,
  BarChart3,
  Users,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Printer,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Power,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff
} from 'lucide-react';

const TABS = [
  { id: 'kds', label: 'Kitchen KDS', icon: UtensilsCrossed },
  { id: 'menu', label: 'Menu Items', icon: ShoppingBag },
  { id: 'tables', label: 'Tables & QR', icon: QrCode },
  { id: 'reports', label: 'Sales Reports', icon: BarChart3 },
  { id: 'staff', label: 'Staff Accounts', icon: Users },
  { id: 'settings', label: 'Store Controls', icon: SettingsIcon }
];

export default function AdminDashboardPage() {
  const { socket, isConnected, isReconnecting, onReconnect } = useSocketState();

  // Audio chime state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('emerald_sound_enabled') !== 'false';
  });

  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginEmail, setLoginEmail] = useState('admin@cafeemerald.com');
  const [loginPassword, setLoginPassword] = useState('adminpassword123');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Active view
  const [activeTab, setActiveTab] = useState('kds');

  // KDS Orders state
  const [orders, setOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('all');

  // Menu Items state
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState({
    name: '',
    category: 'coffee',
    price: '',
    description: '',
    emoji: '☕',
    isVeg: true,
    isAvailable: true,
    image: '',
    imageFile: null
  });

  // Tables state
  const [tables, setTables] = useState([]);
  const [qrModalTable, setQrModalTable] = useState(null);

  // Reports state
  const [reports, setReports] = useState(null);

  // Staff state
  const [staffList, setStaffList] = useState([]);
  const [newStaffModal, setNewStaffModal] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState({ name: '', email: '', password: '', role: 'staff' });

  // Store Settings state
  const [settings, setSettings] = useState(null);

  // 1. Initial Authentication Check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get('/auth/me');
        if (res.data.success) {
          setCurrentUser(res.data.data);
          // Authenticate socket for staff room
          if (socket) {
            const token = localStorage.getItem('emerald_token');
            if (token) socket.emit('auth:staff', token);
          }
        }
      } catch (err) {
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    checkAuth();
  }, [socket]);

  // 2. Data Fetching based on tab & auth
  useEffect(() => {
    if (!currentUser) return;

    if (activeTab === 'kds') fetchOrders();
    if (activeTab === 'menu') fetchMenuItems();
    if (activeTab === 'tables') fetchTables();
    if (activeTab === 'reports') fetchReports();
    if (activeTab === 'staff') fetchStaff();
    if (activeTab === 'settings') fetchSettings();
  }, [currentUser, activeTab]);

  // 3. Socket real-time event listeners with chime and reconnect auto-refetch
  useEffect(() => {
    if (!socket || !currentUser) return;

    socket.on('order:created', (newOrder) => {
      setOrders((prev) => [newOrder, ...prev]);
      if (soundEnabled) {
        playOrderChime();
      }
    });

    socket.on('order:updated', (updatedOrder) => {
      setOrders((prev) => prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o)));
    });

    socket.on('settings:updated', (updatedSettings) => {
      setSettings(updatedSettings);
    });

    return () => {
      socket.off('order:created');
      socket.off('order:updated');
      socket.off('settings:updated');
    };
  }, [socket, currentUser, soundEnabled]);

  // 4. Auto-refetch current orders when connection drops and reconnects
  useEffect(() => {
    if (!onReconnect || !currentUser) return;
    const unsubscribe = onReconnect(() => {
      console.log('[KDS] Real-time connection restored: auto-refetching orders...');
      fetchOrders();
      if (activeTab === 'menu') fetchMenuItems();
      if (activeTab === 'reports') fetchReports();
    });
    return unsubscribe;
  }, [onReconnect, currentUser, activeTab]);

  // 5. Polling fallback when WebSocket disconnected
  useEffect(() => {
    if (isConnected || !currentUser) return;
    console.log('[KDS] WebSocket disconnected: activating 8s polling fallback');
    const interval = setInterval(() => {
      fetchOrders();
    }, 8000);
    return () => clearInterval(interval);
  }, [isConnected, currentUser]);

  // API Call Handlers
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await api.post('/auth/login', { email: loginEmail, password: loginPassword });
      if (res.data.success) {
        localStorage.setItem('emerald_token', res.data.token);
        setCurrentUser(res.data.user);
        if (socket) socket.emit('auth:staff', res.data.token);
      }
    } catch (err) {
      setLoginError(err.response?.data?.message || 'Login failed. Check credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    localStorage.removeItem('emerald_token');
    setCurrentUser(null);
  };

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMenuItems = async () => {
    try {
      const res = await api.get('/items', { params: { includeDeleted: true } });
      setMenuItems(res.data.data || []);
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTables = async () => {
    try {
      const res = await api.get('/tables');
      setTables(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await api.get('/reports/summary');
      setReports(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await api.get('/auth/staff');
      setStaffList(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/settings');
      setSettings(res.data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      setOrders((prev) => prev.map((o) => (o._id === orderId ? { ...o, status: newStatus } : o)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update order status');
    }
  };

  const handleMarkPaid = async (orderId, paymentMethod = 'cash') => {
    try {
      const res = await api.patch(`/orders/${orderId}/mark-paid`, { paymentMethod });
      setOrders((prev) => prev.map((o) => (o._id === orderId ? res.data.data : o)));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to mark order as paid');
    }
  };

  const toggleItemAvailability = async (item) => {
    try {
      const res = await api.patch(`/items/${item._id}/availability`, { isAvailable: !item.isAvailable });
      setMenuItems((prev) => prev.map((i) => (i._id === item._id ? res.data.data : i)));
    } catch (err) {
      alert('Failed to toggle availability');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Are you sure you want to soft-delete this item?')) return;
    try {
      await api.delete(`/items/${itemId}`);
      fetchMenuItems();
    } catch (err) {
      alert('Failed to delete item');
    }
  };

  const handleRestoreItem = async (itemId) => {
    try {
      await api.patch(`/items/${itemId}/restore`);
      fetchMenuItems();
    } catch (err) {
      alert('Failed to restore item');
    }
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('name', itemForm.name);
      formData.append('category', itemForm.category);
      formData.append('price', itemForm.price);
      formData.append('description', itemForm.description);
      formData.append('emoji', itemForm.emoji);
      formData.append('isVeg', itemForm.isVeg);
      formData.append('isAvailable', itemForm.isAvailable);
      if (itemForm.imageFile) {
        formData.append('imageFile', itemForm.imageFile);
      } else if (itemForm.image) {
        formData.append('image', itemForm.image);
      }

      if (editingItem) {
        await api.put(`/items/${editingItem._id}`, formData);
      } else {
        await api.post('/items', formData);
      }

      setItemModalOpen(false);
      setEditingItem(null);
      fetchMenuItems();
    } catch (err) {
      alert(err.response?.data?.message || 'Error saving menu item');
    }
  };

  const handleToggleAcceptingOrders = async () => {
    if (!settings) return;
    try {
      const res = await api.patch('/settings', { acceptingOrders: !settings.acceptingOrders });
      setSettings(res.data.data);
    } catch (err) {
      alert('Failed to update store master switch');
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/staff', newStaffForm);
      setNewStaffModal(false);
      setNewStaffForm({ name: '', email: '', password: '', role: 'staff' });
      fetchStaff();
    } catch (err) {
      alert(err.response?.data?.message || 'Error creating staff');
    }
  };

  const handleDeleteStaff = async (id) => {
    if (!confirm('Delete this staff account?')) return;
    try {
      await api.delete(`/auth/staff/${id}`);
      fetchStaff();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove staff');
    }
  };

  // Render Login Screen if unauthenticated
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#06140e] flex items-center justify-center text-white">
        <span className="animate-pulse text-sm">Authenticating staff session...</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#06140e] flex items-center justify-center p-6 text-white">
        <div className="w-full max-w-[420px] bg-[#0b241a] border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <span className="text-4xl block mb-2">☕</span>
            <h1 className="text-xl font-extrabold tracking-tight">Café Emerald Management</h1>
            <p className="text-xs text-white/60 mt-1">Staff & Owner Portal · Authenticated Access</p>
          </div>

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider block mb-1">
                Staff Email
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-mintGreen"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-white/60 uppercase tracking-wider block mb-1">
                Password
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-mintGreen"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full h-11 rounded-full bg-mintGreen text-[#071a12] font-bold text-sm hover:bg-[#88e7bd] transition shadow-lg shadow-mintGreen/20 disabled:opacity-50 mt-2"
            >
              {loginLoading ? 'Signing in...' : 'Sign In to Portal'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/" className="text-xs text-white/40 hover:text-white transition">
              ← Return to Customer Ordering
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Dashboard Layout
  return (
    <div className="min-h-screen bg-[#06140e] text-white flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-[#06140e]/95 backdrop-blur-md border-b border-white/10 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">☕</span>
          <div>
            <h1 className="text-base font-extrabold tracking-tight">CAFÉ EMERALD ADMIN</h1>
            <div className="flex items-center gap-2 text-[11px] text-white/60">
              <span className="text-mintGreen font-semibold">{currentUser.name}</span>
              <span>•</span>
              <span className="uppercase tracking-wider px-1.5 py-0.2 rounded bg-white/10 text-[10px]">
                {currentUser.role}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Realtime WebSocket Connection Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
              isConnected
                ? 'bg-emerald-500/15 border-emerald-500/30 text-mintGreen'
                : isReconnecting
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 animate-pulse'
                : 'bg-red-500/15 border-red-500/30 text-coralRed'
            }`}
            title={isConnected ? 'Live WebSocket Connected' : 'Polling Fallback Active'}
          >
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="hidden sm:inline">
              {isConnected ? 'Live WS' : isReconnecting ? 'Reconnecting (Polling)' : 'Offline (Polling)'}
            </span>
          </div>

          {/* Sound Alert Toggle */}
          <button
            onClick={() => {
              unlockAudio();
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem('emerald_sound_enabled', String(next));
              if (next) playOrderChime();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
              soundEnabled
                ? 'bg-mintGreen/15 border-mintGreen/30 text-mintGreen hover:bg-mintGreen/25'
                : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
            }`}
            title={soundEnabled ? 'Order sound alert ON (click to mute)' : 'Order sound alert OFF (click to enable)'}
          >
            {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            <span className="hidden md:inline">{soundEnabled ? 'Chime ON' : 'Chime OFF'}</span>
          </button>

          {/* Quick Master Switch Status Pill */}
          {settings && (
            <button
              onClick={handleToggleAcceptingOrders}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                settings.acceptingOrders
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-mintGreen hover:bg-emerald-500/25'
                  : 'bg-red-500/15 border-red-500/30 text-coralRed hover:bg-red-500/25'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{settings.acceptingOrders ? 'Store Active (Accepting)' : 'Store Paused'}</span>
            </button>
          )}

          <a
            href="/?table=1"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold hover:bg-white/20 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Customer Menu</span>
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 hover:bg-red-500/20 text-xs text-white/70 hover:text-red-300 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Navigation Sub-header Tabs */}
      <div className="bg-[#0b241a] border-b border-white/10 px-6 overflow-x-auto flex gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition ${
                isActive
                  ? 'border-mintGreen text-mintGreen bg-white/5'
                  : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Tab Content */}
      <main className="flex-1 p-6">
        {/* 1. KDS TAB */}
        {activeTab === 'kds' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Kitchen Display System (KDS)</h2>
                <p className="text-xs text-white/60">Live orders pipeline with instant status progression</p>
              </div>
              <div className="flex items-center gap-2">
                {['all', 'new', 'preparing', 'ready', 'served'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setOrderFilter(st)}
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase transition ${
                      orderFilter === st
                        ? 'bg-mintGreen text-[#071a12]'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {orders
                .filter((o) => (orderFilter === 'all' ? o.status !== 'served' && o.status !== 'rejected' : o.status === orderFilter))
                .map((order) => (
                  <div
                    key={order._id}
                    className="bg-[#0b241a] rounded-2xl border border-white/10 p-4 flex flex-col justify-between shadow-lg"
                  >
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
                        <div>
                          <span className="text-xs text-mintGreen font-extrabold block">Table {order.table}</span>
                          <h4 className="text-base font-extrabold text-white">#{order.orderNumber}</h4>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase block mb-1 ${
                              order.status === 'new'
                                ? 'bg-amber-500/20 text-amber-300'
                                : order.status === 'preparing'
                                ? 'bg-blue-500/20 text-blue-300'
                                : order.status === 'ready'
                                ? 'bg-mintGreen/20 text-mintGreen'
                                : 'bg-white/10 text-white/60'
                            }`}
                          >
                            {order.status}
                          </span>
                          <span className="text-xs font-bold text-mintGreen">₹{order.total}</span>
                        </div>
                      </div>

                      {/* Payment Status Pill */}
                      <div className="flex items-center justify-between mb-3 px-2 py-1 rounded-lg bg-black/30 border border-white/5 text-[10px]">
                        <span className="text-white/60">Payment:</span>
                        {order.paymentStatus === 'paid' ? (
                          <span className="font-extrabold text-emerald-300">
                            ✓ PAID ({order.paymentMethod?.toUpperCase() || 'CASH'})
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-amber-300">PENDING</span>
                            <button
                              onClick={() => handleMarkPaid(order._id, 'cash')}
                              className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/40 text-mintGreen font-bold text-[9px] transition"
                            >
                              Mark Cash Paid
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5 text-xs text-white/90 mb-3 max-h-36 overflow-y-auto">
                        {order.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span>
                              <strong>{it.qty}x</strong> {it.name} {it.size ? `(${it.size})` : ''}
                            </span>
                            <span className="text-white/60">₹{it.price * it.qty}</span>
                          </div>
                        ))}
                      </div>

                      {order.note && (
                        <div className="p-2 rounded-xl bg-black/40 border border-white/5 text-[11px] text-amber-200 mb-3">
                          📝 {order.note}
                        </div>
                      )}

                      {/* Print Ticket & Bill Shortcuts */}
                      <div className="flex gap-1.5 mb-3">
                        <button
                          onClick={() => window.open(`/api/orders/${order._id}/print/bill`, '_blank')}
                          className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/80 hover:text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition"
                        >
                          <Printer className="w-3 h-3" /> Bill
                        </button>
                        <button
                          onClick={() => window.open(`/api/orders/${order._id}/print/kot`, '_blank')}
                          className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-white/80 hover:text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition"
                        >
                          <Printer className="w-3 h-3" /> KOT
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center gap-1.5">
                      {order.status === 'new' && (
                        <button
                          onClick={() => updateOrderStatus(order._id, 'preparing')}
                          className="flex-1 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold transition"
                        >
                          Start Preparing
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button
                          onClick={() => updateOrderStatus(order._id, 'ready')}
                          className="flex-1 py-2 rounded-xl bg-mintGreen hover:bg-[#88e7bd] text-[#071a12] text-xs font-bold transition"
                        >
                          Mark Ready
                        </button>
                      )}
                      {order.status === 'ready' && (
                        <button
                          onClick={() => updateOrderStatus(order._id, 'served')}
                          className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition"
                        >
                          Mark Served
                        </button>
                      )}
                      <button
                        onClick={() => updateOrderStatus(order._id, 'rejected')}
                        className="px-2.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 text-coralRed text-xs font-bold transition"
                        title="Reject Order"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 2. MENU ITEMS TAB */}
        {activeTab === 'menu' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Menu Items Management</h2>
                <p className="text-xs text-white/60">Create, edit, soft-delete, and toggle sold-out availability</p>
              </div>
              <button
                onClick={() => {
                  setEditingItem(null);
                  setItemForm({
                    name: '',
                    category: 'coffee',
                    price: '',
                    description: '',
                    emoji: '☕',
                    isVeg: true,
                    isAvailable: true,
                    image: '',
                    imageFile: null
                  });
                  setItemModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-mintGreen text-[#071a12] text-xs font-bold hover:bg-[#88e7bd] transition shadow-md"
              >
                <Plus className="w-4 h-4" /> Add New Item
              </button>
            </div>

            <div className="bg-[#0b241a] rounded-3xl border border-white/10 overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 uppercase tracking-wider text-white/50 text-[10px]">
                  <tr>
                    <th className="p-4">Item</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Base Price</th>
                    <th className="p-4">Diet</th>
                    <th className="p-4">Availability</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {menuItems.map((item) => (
                    <tr key={item._id} className={item.isDeleted ? 'opacity-40 bg-black/20' : 'hover:bg-white/[0.02]'}>
                      <td className="p-4 flex items-center gap-3">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-10 h-10 rounded-xl object-cover border border-white/10"
                        />
                        <div>
                          <div className="font-bold text-white text-sm">{item.name}</div>
                          <span className="text-[11px] text-white/50 line-clamp-1">{item.description}</span>
                        </div>
                      </td>
                      <td className="p-4 uppercase font-semibold text-white/60">{item.category}</td>
                      <td className="p-4 font-bold text-white">₹{item.price}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${item.isVeg ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                          {item.isVeg ? 'VEG' : 'NON-VEG'}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => toggleItemAvailability(item)}
                          disabled={item.isDeleted}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition ${
                            item.isAvailable
                              ? 'bg-mintGreen/20 text-mintGreen hover:bg-mintGreen/30'
                              : 'bg-red-500/20 text-coralRed hover:bg-red-500/30'
                          }`}
                        >
                          {item.isAvailable ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          <span>{item.isAvailable ? 'Available' : 'Sold Out'}</span>
                        </button>
                      </td>
                      <td className="p-4">
                        {item.isDeleted ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-white/40">
                            SOFT DELETED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-mintGreen">
                            ACTIVE
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {item.isDeleted ? (
                          <button
                            onClick={() => handleRestoreItem(item._id)}
                            className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs text-mintGreen font-bold"
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setItemForm({
                                  name: item.name,
                                  category: item.category,
                                  price: item.price,
                                  description: item.description,
                                  emoji: item.emoji || '☕',
                                  isVeg: item.isVeg,
                                  isAvailable: item.isAvailable,
                                  image: item.image,
                                  imageFile: null
                                });
                                setItemModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-white/70 hover:text-white"
                              title="Edit Item"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item._id)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                              title="Soft Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. TABLES & QR CODE GENERATOR TAB */}
        {activeTab === 'tables' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Tables & Print-Ready QR Codes</h2>
                <p className="text-xs text-white/60">
                  Cryptographically signed QR codes (HMAC-SHA256) preventing table spoofing
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 text-xs font-bold hover:bg-white/20 transition"
              >
                <Printer className="w-4 h-4" /> Print Sheet
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {tables.map((tbl) => (
                <div
                  key={tbl.tableNumber}
                  className="bg-[#0b241a] border border-white/10 rounded-3xl p-5 text-center flex flex-col items-center justify-between shadow-lg"
                >
                  <div className="w-full">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-mintGreen">Table {tbl.tableNumber}</span>
                      {tbl.hasActiveOrder ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-500/20 text-amber-300">
                          {tbl.activeOrdersCount} Open
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-white/5 text-white/40">
                          Vacant
                        </span>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-2xl shadow-inner mb-3 flex items-center justify-center">
                      <img src={tbl.qrDataUri} alt={`Table ${tbl.tableNumber} QR`} className="w-36 h-36" />
                    </div>

                    <p className="text-[10px] font-mono text-white/40 truncate w-full" title={tbl.sig}>
                      Sig: {tbl.sig.slice(0, 10)}...
                    </p>
                  </div>

                  <div className="w-full pt-3 border-t border-white/10 flex gap-2">
                    <a
                      href={tbl.targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white transition text-center"
                    >
                      Open Link
                    </a>
                    <button
                      onClick={() => setQrModalTable(tbl)}
                      className="px-2.5 py-1.5 rounded-xl bg-mintGreen/20 hover:bg-mintGreen/30 text-mintGreen text-[11px] font-bold"
                    >
                      Enlarge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. SALES REPORTS TAB */}
        {activeTab === 'reports' && reports && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Today's Sales & Analytics</h2>
              <p className="text-xs text-white/60">Live financial metrics and sales performance overview</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#0b241a] border border-white/10 rounded-2xl p-5">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider block mb-1">
                  Today's Revenue
                </span>
                <div className="text-2xl font-extrabold text-mintGreen">₹{reports.today.revenue}</div>
                <span className="text-[11px] text-white/60">Tax collected: ₹{reports.today.tax}</span>
              </div>

              <div className="bg-[#0b241a] border border-white/10 rounded-2xl p-5">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider block mb-1">
                  Today's Orders
                </span>
                <div className="text-2xl font-extrabold text-white">{reports.today.ordersCount}</div>
                <span className="text-[11px] text-white/60">{reports.today.completedCount} fulfilled</span>
              </div>

              <div className="bg-[#0b241a] border border-white/10 rounded-2xl p-5">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider block mb-1">
                  Average Order Value
                </span>
                <div className="text-2xl font-extrabold text-white">₹{reports.today.averageOrderValue}</div>
                <span className="text-[11px] text-white/60">Per customer order</span>
              </div>

              <div className="bg-[#0b241a] border border-white/10 rounded-2xl p-5">
                <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider block mb-1">
                  All-Time Revenue
                </span>
                <div className="text-2xl font-extrabold text-white">₹{reports.allTime.revenue}</div>
                <span className="text-[11px] text-white/60">{reports.allTime.ordersCount} total orders</span>
              </div>
            </div>

            {/* Top Items Table */}
            <div className="bg-[#0b241a] border border-white/10 rounded-3xl p-6">
              <h3 className="text-base font-bold text-white mb-4">Top 10 Selling Menu Items</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase text-white/50 border-b border-white/10 pb-2">
                    <tr>
                      <th className="pb-3">Rank</th>
                      <th className="pb-3">Item Name</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Units Sold</th>
                      <th className="pb-3 text-right">Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {reports.topItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02]">
                        <td className="py-3 font-bold text-mintGreen">#{idx + 1}</td>
                        <td className="py-3 font-bold text-white">
                          {item.emoji} {item.name}
                        </td>
                        <td className="py-3 uppercase text-white/60">{item.category}</td>
                        <td className="py-3 font-bold text-white">{item.qtySold} units</td>
                        <td className="py-3 text-right font-bold text-mintGreen">₹{item.revenue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 5. STAFF MANAGEMENT TAB */}
        {activeTab === 'staff' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight">Staff Accounts Management</h2>
                <p className="text-xs text-white/60">Manage kitchen operators, baristas, and manager credentials</p>
              </div>
              {currentUser.role === 'owner' && (
                <button
                  onClick={() => setNewStaffModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-mintGreen text-[#071a12] text-xs font-bold hover:bg-[#88e7bd] transition shadow-md"
                >
                  <Plus className="w-4 h-4" /> Add Staff Member
                </button>
              )}
            </div>

            <div className="bg-[#0b241a] rounded-3xl border border-white/10 overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 border-b border-white/10 uppercase tracking-wider text-white/50 text-[10px]">
                  <tr>
                    <th className="p-4">Name</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {staffList.map((member) => (
                    <tr key={member._id} className="hover:bg-white/[0.02]">
                      <td className="p-4 font-bold text-white">{member.name}</td>
                      <td className="p-4 text-white/60">{member.email}</td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            member.role === 'owner'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            member.isLocked
                              ? 'bg-red-500/20 text-coralRed'
                              : 'bg-emerald-500/20 text-mintGreen'
                          }`}
                        >
                          {member.isLocked ? 'LOCKED (Failed Logins)' : 'ACTIVE'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {currentUser.role === 'owner' && member.role !== 'owner' && member._id !== currentUser._id && (
                          <button
                            onClick={() => handleDeleteStaff(member._id)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400"
                            title="Remove Staff"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. STORE CONTROLS & SETTINGS TAB */}
        {activeTab === 'settings' && settings && (
          <div className="max-w-2xl bg-[#0b241a] border border-white/10 rounded-3xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Store Controls & Business Config</h2>
              <p className="text-xs text-white/60">Configure café operations, tax numbers, and emergency pause</p>
            </div>

            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-white text-sm">Accepting New Orders</h4>
                <p className="text-xs text-white/50">
                  Toggle off to temporarily freeze customer ordering (e.g. rush hour, kitchen maintenance)
                </p>
              </div>
              <button
                onClick={handleToggleAcceptingOrders}
                className={`px-4 py-2 rounded-full font-bold text-xs transition ${
                  settings.acceptingOrders
                    ? 'bg-mintGreen text-[#071a12] hover:bg-[#88e7bd]'
                    : 'bg-red-500 text-white hover:bg-red-400'
                }`}
              >
                {settings.acceptingOrders ? 'Accepting Orders' : 'Paused (Locked)'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase block mb-1">Café Name</label>
                <input
                  type="text"
                  value={settings.cafeName}
                  disabled
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/80"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase block mb-1">GSTIN Number</label>
                <input
                  type="text"
                  value={settings.gstin}
                  disabled
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/80"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase block mb-1">FSSAI License</label>
                <input
                  type="text"
                  value={settings.fssai}
                  disabled
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/80"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase block mb-1">GST Rate Split</label>
                <input
                  type="text"
                  value="5% Total (2.5% CGST + 2.5% SGST)"
                  disabled
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white/80"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Item Create / Edit */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b241a] border border-white/10 rounded-3xl p-6 w-full max-w-[480px] shadow-2xl">
            <h3 className="text-lg font-extrabold text-white mb-4">
              {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
            </h3>

            <form onSubmit={handleSaveItem} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-mintGreen outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Category</label>
                  <select
                    value={itemForm.category}
                    onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-mintGreen outline-none"
                  >
                    <option value="coffee">Coffee</option>
                    <option value="cold">Cold</option>
                    <option value="snacks">Snacks</option>
                    <option value="desserts">Desserts</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Base Price (₹)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={itemForm.price}
                    onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-mintGreen outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Description</label>
                <textarea
                  value={itemForm.description}
                  onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                  rows={2}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white focus:border-mintGreen outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">
                  Upload Image File (Multer) or Enter Image URL
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setItemForm({ ...itemForm, imageFile: e.target.files[0] })}
                  className="w-full text-xs text-white/60 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:bg-white/10 file:text-white file:text-xs file:font-semibold hover:file:bg-white/20"
                />
                <input
                  type="url"
                  placeholder="Or paste image URL (Unsplash, Cloudinary)..."
                  value={itemForm.image}
                  onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:border-mintGreen outline-none mt-1.5"
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.isVeg}
                    onChange={(e) => setItemForm({ ...itemForm, isVeg: e.target.checked })}
                    className="accent-mintGreen"
                  />
                  <span>Vegetarian</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={itemForm.isAvailable}
                    onChange={(e) => setItemForm({ ...itemForm, isAvailable: e.target.checked })}
                    className="accent-mintGreen"
                  />
                  <span>Available in Stock</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-mintGreen text-[#071a12] hover:bg-[#88e7bd] transition font-bold"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Staff Creation */}
      {newStaffModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b241a] border border-white/10 rounded-3xl p-6 w-full max-w-[420px] shadow-2xl">
            <h3 className="text-lg font-extrabold text-white mb-4">Add Staff Member</h3>
            <form onSubmit={handleCreateStaff} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newStaffForm.name}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, name: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-mintGreen"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newStaffForm.email}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, email: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-mintGreen"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newStaffForm.password}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, password: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-mintGreen"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-white/60 uppercase mb-1">Role</label>
                <select
                  value={newStaffForm.role}
                  onChange={(e) => setNewStaffForm({ ...newStaffForm, role: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-mintGreen"
                >
                  <option value="staff">Staff (Kitchen / Floor)</option>
                  <option value="owner">Co-Owner (Full Admin)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setNewStaffModal(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-mintGreen text-[#071a12] font-bold"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Enlarge Table QR */}
      {qrModalTable && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b241a] border border-white/10 rounded-3xl p-6 text-center max-w-[360px] shadow-2xl">
            <h3 className="text-xl font-extrabold text-white mb-1">Table {qrModalTable.tableNumber}</h3>
            <p className="text-xs text-mintGreen font-semibold mb-4">Official Café Emerald Table Tent</p>
            <div className="bg-white p-4 rounded-2xl shadow-xl mb-4 flex items-center justify-center">
              <img src={qrModalTable.qrDataUri} alt="QR Code" className="w-56 h-56" />
            </div>
            <div className="text-[11px] text-white/60 mb-4 break-all">
              Scan to order from Table {qrModalTable.tableNumber}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-mintGreen text-[#071a12] font-bold text-xs"
              >
                Print Tent
              </button>
              <button
                onClick={() => setQrModalTable(null)}
                className="px-4 py-2.5 rounded-xl bg-white/10 text-white font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
