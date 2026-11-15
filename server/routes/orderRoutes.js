const express = require('express');
const router = express.Router();
const {
  createOrder,
  getOrderById,
  getAllOrders,
  updateOrderStatus
} = require('../controllers/orderController');
const { protect, adminOnly } = require('../middleware/auth');

router.route('/')
  .post(createOrder)
  .get(protect, adminOnly, getAllOrders);

router.route('/:id')
  .get(getOrderById);

router.patch('/:id/status', protect, adminOnly, updateOrderStatus);

module.exports = router;

