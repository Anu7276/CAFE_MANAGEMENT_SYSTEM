const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');

const getSettings = async (req, res, next) => {
  try {
    const settings = await Settings.get();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const userRole = req.user?.role === 'admin' ? 'owner' : (req.user?.role || 'staff');

    // Granular field permission enforcement:
    // Staff may ONLY toggle `acceptingOrders`.
    // All other fields require owner role.
    if (userRole !== 'owner') {
      const allowedStaffFields = ['acceptingOrders'];
      const attemptedFields = Object.keys(req.body).filter(k => !allowedStaffFields.includes(k));

      if (attemptedFields.length > 0) {
        return res.status(403).json({
          success: false,
          message: `Forbidden: Only the café owner can modify ${attemptedFields.join(', ')}. Staff may only toggle acceptingOrders.`
        });
      }
    }

    // Support businessName alias for cafeName
    const payload = { ...req.body };
    if (payload.businessName && !payload.cafeName) {
      payload.cafeName = payload.businessName;
    }
    // Support total taxRate alias (split into equal cgstRate and sgstRate)
    if (typeof payload.taxRate === 'number') {
      payload.cgstRate = payload.taxRate / 2;
      payload.sgstRate = payload.taxRate / 2;
    }

    const updated = await Settings.update(payload, req.user || {});

    // Broadcast updated settings to all clients (e.g. acceptingOrders toggle)
    const io = req.app.get('io');
    if (io) {
      io.emit('settings:updated', updated);
    }

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'settings_updated',
      entity: 'Settings',
      entityId: 'global_settings',
      details: req.body,
      ip: req.ip
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find(req.query);
    res.json({ success: true, count: logs.length, data: logs });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getAuditLogs
};
