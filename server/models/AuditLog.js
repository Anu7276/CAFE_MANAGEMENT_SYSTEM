const mongoose = require('mongoose');
const { readStore, writeStore } = require('./storeAdapter');

const auditLogSchema = new mongoose.Schema({
  _id: { type: String, default: () => 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) },
  userId: { type: String, default: 'system' },
  userEmail: { type: String, default: 'system' },
  userRole: { type: String, default: 'system' },
  action: { type: String, required: true },
  entity: { type: String },
  entityId: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String, default: '' },
  timestamp: { type: String, default: () => new Date().toISOString() }
}, {
  timestamps: true,
  _id: false
});

const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

class AuditLog {
  static get mongooseModel() {
    return AuditLogModel;
  }

  static async create(data) {
    return this.logAction(data);
  }

  static async logAction({ userId, userEmail, userRole, action, entity, entityId, details = {}, ip = '' }) {
    try {
      if (isMongoConnected()) {
        const doc = await AuditLogModel.create({
          userId: userId || 'system',
          userEmail: userEmail || 'system',
          userRole: userRole || 'system',
          action,
          entity,
          entityId: String(entityId || ''),
          details,
          ip,
          timestamp: new Date().toISOString()
        });
        return doc.toObject ? doc.toObject() : doc;
      }

      if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: AuditLog model cannot use dev store fallback in production. MongoDB connection is required.');
      }

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
    if (isMongoConnected()) {
      const mongoQuery = {};
      if (query.action) mongoQuery.action = query.action;
      if (query.entity) mongoQuery.entity = query.entity;
      const limit = Number(query.limit) || 100;
      const docs = await AuditLogModel.find(mongoQuery).sort({ createdAt: -1 }).limit(limit);
      return docs.map(d => (d.toObject ? d.toObject() : d));
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: AuditLog model cannot use dev store fallback in production. MongoDB connection is required.');
    }

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
