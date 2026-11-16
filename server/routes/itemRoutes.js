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
const { protect, requireRole, requireOwner } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public menu items
router.get('/', getItems);
router.get('/:id', getItemById);

// Staff can toggle availability when items run out during shifts
router.patch('/:id/availability', protect, requireRole(['owner', 'staff']), toggleAvailability);

// Owner-only menu mutations (catalog creation, editing pricing, deleting, restoring)
router.post('/', protect, requireOwner, upload.single('imageFile'), createItem);
router.put('/:id', protect, requireOwner, upload.single('imageFile'), updateItem);
router.delete('/:id', protect, requireOwner, deleteItem);
router.patch('/:id/restore', protect, requireOwner, restoreItem);

module.exports = router;
