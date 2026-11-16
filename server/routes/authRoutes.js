const express = require('express');
const router = express.Router();
const {
  login,
  register,
  logout,
  getMe,
  listStaff,
  createStaff,
  deleteStaff
} = require('../controllers/authController');
const { protect, requireRole, requireOwner } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const { validateBody, loginSchema, registerSchema } = require('../middleware/validate');

router.post('/login', loginLimiter, validateBody(loginSchema), login);
router.post('/register', validateBody(registerSchema), register);
router.post('/logout', logout);
router.get('/me', protect, getMe);

// Staff management endpoints (strictly owner-only)
router.get('/staff', protect, requireOwner, listStaff);
router.post('/staff', protect, requireOwner, createStaff);
router.delete('/staff/:id', protect, requireOwner, deleteStaff);

module.exports = router;
