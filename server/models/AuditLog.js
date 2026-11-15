const { readStore, writeStore } = require('./storeAdapter');

class AuditLog {
  static async logAction({ userId, userEmail, userRole, action, entity, entityId, details = {}, ip = '' }) {
    try {
      const store = readStore();
      if (!store.auditLogs) store.auditLogs = [];

      const entry = {
        _id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        userId: userId || 'system',
        userEmail: userEmail || 'system',
        userRole: userRole || 'system',
        action,
        entity,
        entityId: String(entityId || ''),
        details,
        ip,
        timestamp: new Date().toISOString()
      };

      store.auditLogs.unshift(entry);
      // Keep last 500 audit logs
      if (store.auditLogs.length > 500) {
        store.auditLogs = store.auditLogs.slice(0, 500);
      }
      writeStore(store);
      return entry;
    } catch (err) {
      console.error('AuditLog error:', err);
    }
  }

  static async find(query = {}) {
    const store = readStore();
    let logs = [...(store.auditLogs || [])];

    if (query.action) {
      logs = logs.filter(l => l.action === query.action);
    }
    if (query.entity) {
      logs = logs.filter(l => l.entity === query.entity);
    }
    const limit = Number(query.limit) || 100;
    return logs.slice(0, limit);
  }
}

module.exports = AuditLog;
