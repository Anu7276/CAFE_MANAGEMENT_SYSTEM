const QRCode = require('qrcode');
const Settings = require('../models/Settings');
const Order = require('../models/Order');
const { generateTableSig } = require('../utils/tableToken');

/**
 * Get all tables with signed QR codes and current order activity
 */
const getTables = async (req, res, next) => {
  try {
    const settings = await Settings.get();
    const totalTables = Number(settings.totalTables) || 20;
    const publicUrl = process.env.PUBLIC_URL || process.env.CLIENT_URL || 'http://localhost:5173';

    // Get active orders to compute live table occupancy
    const activeOrders = await Order.find();
    const openOrders = activeOrders.filter(o => ['new', 'preparing', 'ready'].includes(o.status));

    const tables = [];
    for (let i = 1; i <= totalTables; i++) {
      const sig = generateTableSig(i);
      const targetUrl = `${publicUrl}/t/${i}?sig=${sig}`;
      const qrDataUri = await QRCode.toDataURL(targetUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 320,
        color: {
          dark: '#071a12',
          light: '#ffffff'
        }
      });

      const tableOrders = openOrders.filter(o => Number(o.table) === i);

      tables.push({
        tableNumber: i,
        sig,
        targetUrl,
        qrDataUri,
        activeOrdersCount: tableOrders.length,
        hasActiveOrder: tableOrders.length > 0,
        activeOrders: tableOrders.map(o => ({
          _id: o._id,
          orderNumber: o.orderNumber,
          orderToken: o.orderToken,
          status: o.status,
          total: o.total
        }))
      });
    }

    res.json({
      success: true,
      count: tables.length,
      data: tables
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single table QR data
 */
const getTableQr = async (req, res, next) => {
  try {
    const tableNumber = Number(req.params.table);
    if (!tableNumber || tableNumber < 1 || tableNumber > 100) {
      return res.status(400).json({ success: false, message: 'Invalid table number' });
    }

    const publicUrl = process.env.PUBLIC_URL || process.env.CLIENT_URL || 'http://localhost:5173';
    const sig = generateTableSig(tableNumber);
    const targetUrl = `${publicUrl}/t/${tableNumber}?sig=${sig}`;

    const qrDataUri = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 400,
      color: {
        dark: '#071a12',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      data: {
        tableNumber,
        sig,
        targetUrl,
        qrDataUri
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTables,
  getTableQr
};
