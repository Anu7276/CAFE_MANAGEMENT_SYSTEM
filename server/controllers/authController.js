const User = require('../models/User');
const generateToken = require('../utils/generateToken');

const setTokenCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN; // e.g. '.yourcafe.com' for sibling subdomains

  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  };

  // Sibling subdomain mode: SameSite=Lax scoped to parent domain
  // Fallback mode (different TLDs like vercel.app and onrender.com): SameSite=None, Secure=true
  if (cookieDomain) {
    cookieOptions.domain = cookieDomain.startsWith('.') ? cookieDomain : `.${cookieDomain}`;
    cookieOptions.sameSite = 'lax';
  } else {
    cookieOptions.sameSite = isProd ? 'none' : 'lax';
  }

  res.cookie('emerald_token', token, cookieOptions);
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (User.isLocked(user)) {
      const waitMinutes = Math.ceil((new Date(user.lockUntil).getTime() - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked due to excessive failed attempts. Try again in ${waitMinutes} minute(s).`
      });
    }

    const isMatch = await User.comparePassword(password, user.passwordHash);
    if (!isMatch) {
      await User.registerFailedAttempt(user._id);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Reset lockout counters on success
    await User.resetFailedAttempts(user._id);

    const token = generateToken(user._id, user.role);
    setTokenCookie(res, token);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const newUser = await User.create({ name, email, password, role });
    const token = generateToken(newUser._id, newUser.role);
    setTokenCookie(res, token);

    res.status(201).json({
      success: true,
      data: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN;
  const clearOptions = {
    httpOnly: true,
    secure: isProd
  };

  if (cookieDomain) {
    clearOptions.domain = cookieDomain.startsWith('.') ? cookieDomain : `.${cookieDomain}`;
    clearOptions.sameSite = 'lax';
  } else {
    clearOptions.sameSite = isProd ? 'none' : 'lax';
  }

  res.clearCookie('emerald_token', clearOptions);
  res.json({ success: true, message: 'Logged out successfully' });
};

const getMe = async (req, res) => {
  res.json({
    success: true,
    data: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
};

const listStaff = async (req, res, next) => {
  try {
    const staff = await User.find();
    res.json({ success: true, count: staff.length, data: staff });
  } catch (error) {
    next(error);
  }
};

const createStaff = async (req, res, next) => {
  try {
    const { name, email, password, role = 'staff' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'User with this email already exists' });
    }

    const newStaff = await User.create({
      name,
      email,
      password,
      role: role === 'owner' ? 'owner' : 'staff'
    });

    res.status(201).json({
      success: true,
      data: {
        _id: newStaff._id,
        name: newStaff.name,
        email: newStaff.email,
        role: newStaff.role
      }
    });
  } catch (error) {
    next(error);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (target.role === 'owner') {
      return res.status(403).json({ success: false, message: 'Cannot delete the primary owner account' });
    }

    if (target._id === req.user._id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own active account' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Staff member removed successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  register,
  logout,
  getMe,
  listStaff,
  createStaff,
  deleteStaff
};
