const express = require('express');
const router = express.Router();
const { getSalesSummary } = require('../controllers/reportController');
const { protect, requireRole } = require('../middleware/auth');

router.get('/summary', protect, requireRole(['owner', 'staff']), getSalesSummary);

module.exports = router;
