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
    const updated = await Settings.update(req.body, req.user || {});

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
