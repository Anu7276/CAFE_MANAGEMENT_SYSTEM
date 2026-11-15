const express = require('express');
const router = express.Router();
const { getTables, getTableQr } = require('../controllers/tableController');
const { protect, requireRole } = require('../middleware/auth');

// Protected tables and QR generator endpoints
router.get('/', protect, requireRole(['owner', 'staff']), getTables);
router.get('/:table/qr', protect, requireRole(['owner', 'staff']), getTableQr);

module.exports = router;
