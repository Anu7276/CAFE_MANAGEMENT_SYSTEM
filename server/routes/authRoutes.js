const express = require('express');
const router = express.Router();
const { login, register, logout, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const { validateBody, loginSchema, registerSchema } = require('../middleware/validate');

router.post('/login', loginLimiter, validateBody(loginSchema), login);
router.post('/register', validateBody(registerSchema), register);
router.post('/logout', logout);
router.get('/me', protect, getMe);

module.exports = router;
