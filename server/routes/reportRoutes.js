const express = require('express');
const router = express.Router();
const { getSalesSummary } = require('../controllers/reportController');
const { protect, requireOwner } = require('../middleware/auth');

router.get('/summary', protect, requireOwner, getSalesSummary);

module.exports = router;
