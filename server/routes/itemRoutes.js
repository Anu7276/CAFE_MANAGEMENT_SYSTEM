const express = require('express');
const router = express.Router();
const {
  getItems,
  getItemById,
  createItem,
  updateItem,
  toggleAvailability,
  deleteItem,
  restoreItem
} = require('../controllers/itemController');
const { protect, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public menu items
router.get('/', getItems);
router.get('/:id', getItemById);

// Staff / Owner Protected Items Management
router.post('/', protect, requireRole(['owner', 'staff']), upload.single('imageFile'), createItem);
router.put('/:id', protect, requireRole(['owner', 'staff']), upload.single('imageFile'), updateItem);
router.patch('/:id/availability', protect, requireRole(['owner', 'staff']), toggleAvailability);
router.delete('/:id', protect, requireRole(['owner', 'staff']), deleteItem);
router.patch('/:id/restore', protect, requireRole(['owner', 'staff']), restoreItem);

module.exports = router;
