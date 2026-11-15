const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '../data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultData = {
  users: [
    {
      _id: 'usr_admin_1',
      name: 'Café Manager',
      email: 'admin@cafeemerald.com',
      passwordHash: bcrypt.hashSync('adminpassword123', 10),
      role: 'admin'
    }
  ],
  categories: [
    { _id: 'cat_coffee', slug: 'coffee', name: 'Coffee', emoji: '☕', sortOrder: 1 },
    { _id: 'cat_cold', slug: 'cold', name: 'Cold', emoji: '🧋', sortOrder: 2 },
    { _id: 'cat_snacks', slug: 'snacks', name: 'Snacks', emoji: '🍔', sortOrder: 3 },
    { _id: 'cat_desserts', slug: 'desserts', name: 'Desserts', emoji: '🍰', sortOrder: 4 }
  ],
  items: [
    {
      _id: 'item_cake_1',
      name: 'Strawberry Chocolate Cake',
      category: 'desserts',
      price: 260,
      description: "These are the best Brownies! Delicious strawberry Cake, Made with dark chocolate, fresh raspberries & milk Chocolate, they're super fudgy and crazy good!",
      image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&auto=format&fit=crop&q=85',
      emoji: '🍰',
      isVeg: true,
      isAvailable: true,
      sizes: [
        { name: '1 Slice', extra: 0 },
        { name: '2 Slices', extra: 240 }
      ]
    },
    {
      _id: 'item_capp_2',
      name: 'Cappuccino',
      category: 'coffee',
      price: 180,
      description: 'Velvety micro-foam espresso crafted with artisanal dark roast beans.',
      image: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=800&auto=format&fit=crop&q=85',
      emoji: '☕',
      isVeg: true,
      isAvailable: true,
      sizes: [
        { name: 'Tall', extra: 0 },
        { name: 'Grande', extra: 30 },
        { name: 'Venti', extra: 60 }
      ]
    },
    {
      _id: 'item_smoothie_3',
      name: 'Mango Smoothie',
      category: 'cold',
      price: 220,
      description: 'Alphonso mango purée whipped with Greek yoghurt and pure organic honey.',
      image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=800&auto=format&fit=crop&q=85',
      emoji: '🥭',
      isVeg: true,
      isAvailable: true,
      sizes: [
        { name: 'Tall', extra: 0 },
        { name: 'Grande', extra: 30 },
        { name: 'Venti', extra: 60 }
      ]
    },
    {
      _id: 'item_coldcoffee_4',
      name: 'Cold Coffee',
      category: 'cold',
      price: 210,
      description: 'Double shot espresso blended chilled with whole milk and vanilla gelato.',
      image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=800&auto=format&fit=crop&q=85',
      emoji: '🧋',
      isVeg: true,
      isAvailable: true,
      sizes: [
        { name: 'Tall', extra: 0 },
        { name: 'Grande', extra: 30 },
        { name: 'Venti', extra: 60 }
      ]
    },
    {
      _id: 'item_burger_5',
      name: 'Chicken Burger',
      category: 'snacks',
      price: 240,
      description: 'Crispy herb chicken breast, Monterey Jack cheese, and smoked paprika aioli.',
      image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&auto=format&fit=crop&q=85',
      emoji: '🍔',
      isVeg: false,
      isAvailable: true,
      sizes: []
    },
    {
      _id: 'item_fries_6',
      name: 'French Fries',
      category: 'snacks',
      price: 120,
      description: 'Golden, crispy hand-cut salted fries served with house garlic mayonnaise.',
      image: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=800&auto=format&fit=crop&q=85',
      emoji: '🍟',
      isVeg: true,
      isAvailable: true,
      sizes: []
    }
  ],
  orders: [
    {
      _id: 'ord_1041',
      orderNumber: 1041,
      table: 3,
      items: [{ name: 'Cold Coffee', price: 210, size: 'Tall', qty: 1 }],
      subtotal: 210,
      tax: 11,
      total: 221,
      note: '',
      paymentMethod: 'counter',
      paymentStatus: 'paid',
      status: 'ready',
      createdAt: new Date(Date.now() - 15 * 60000).toISOString()
    },
    {
      _id: 'ord_1042',
      orderNumber: 1042,
      table: 5,
      items: [
        { name: 'Cappuccino', price: 180, size: 'Grande', qty: 2 },
        { name: 'Strawberry Chocolate Cake', price: 260, size: '1 Slice', qty: 1 }
      ],
      subtotal: 620,
      tax: 31,
      total: 651,
      note: 'Less sugar in coffee',
      paymentMethod: 'counter',
      paymentStatus: 'pending',
      status: 'preparing',
      createdAt: new Date(Date.now() - 8 * 60000).toISOString()
    },
    {
      _id: 'ord_1043',
      orderNumber: 1043,
      table: 2,
      items: [
        { name: 'Cold Coffee', price: 210, size: 'Tall', qty: 1 },
        { name: 'Chicken Burger', price: 240, size: '', qty: 1 }
      ],
      subtotal: 450,
      tax: 23,
      total: 473,
      note: 'Extra napkins please',
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      status: 'new',
      createdAt: new Date(Date.now() - 2 * 60000).toISOString()
    }
  ]
};

function readStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      fs.writeFileSync(STORE_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
      return defaultData;
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return defaultData;
  }
}

function writeStore(data) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write store.json:', err);
  }
}

module.exports = { readStore, writeStore };

