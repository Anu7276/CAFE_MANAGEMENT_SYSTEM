const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getAuditLogs } = require('../controllers/settingsController');
const { protect, requireRole, requireOwner } = require('../middleware/auth');

// Public can read general settings (acceptingOrders, cafeName)
router.get('/', getSettings);

// Protected update for staff / owner
router.patch('/', protect, requireRole(['owner', 'staff']), updateSettings);

// Audit logs restricted to owner
router.get('/audit-logs', protect, requireOwner, getAuditLogs);

module.exports = router;
