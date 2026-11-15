const express = require('express');
const router = express.Router();
const {
  createOrder,
  trackOrder,
  getOrderById,
  getAllOrders,
  updateOrderStatus
} = require('../controllers/orderController');
const { protect, requireRole } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimiter');
const { validateBody, createOrderSchema, updateOrderStatusSchema } = require('../middleware/validate');

// Public customer order placement (rate limited & Zod validated)
router.post('/', orderLimiter, validateBody(createOrderSchema), createOrder);

// Public unguessable order tracking for customer
router.get('/track/:token', trackOrder);

// Staff / Admin endpoints (Protected)
router.get('/', protect, requireRole(['owner', 'staff']), getAllOrders);
router.get('/:id', protect, requireRole(['owner', 'staff']), getOrderById);
router.patch('/:id/status', protect, requireRole(['owner', 'staff']), validateBody(updateOrderStatusSchema), updateOrderStatus);

module.exports = router;
