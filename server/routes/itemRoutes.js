const express = require('express');
const router = express.Router();
const { getItems, createItem, toggleAvailability } = require('../controllers/itemController');
const { protect, adminOnly } = require('../middleware/auth');

router.route('/')
  .get(getItems)
  .post(protect, adminOnly, createItem);

router.patch('/:id/availability', protect, adminOnly, toggleAvailability);

module.exports = router;

