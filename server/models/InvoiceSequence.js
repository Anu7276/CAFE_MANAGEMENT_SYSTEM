/**
 * Atomic Gap-Free GST Invoice Sequence Manager
 * Format: CE/YYYY-YY/000001 (e.g., CE/2026-27/000001)
 * Per Indian Financial Year (April 1 to March 31)
 */

const mongoose = require('mongoose');
const { readStore, writeStore } = require('./storeAdapter');

/**
 * Calculates Indian Financial Year for any given date
 * @param {Date} date 
 * @returns {string} e.g. '2026-27'
 */
function getIndianFinancialYear(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1 = January, 4 = April
  const fullYear = d.getFullYear();

  if (month >= 4) {
    const nextYearShort = String((fullYear + 1) % 100).padStart(2, '0');
    return `${fullYear}-${nextYearShort}`;
  } else {
    const currentYearShort = String(fullYear % 100).padStart(2, '0');
    return `${fullYear - 1}-${currentYearShort}`;
  }
}

/**
 * Official Mongoose InvoiceSequence Schema
 */
const invoiceSequenceSchema = new mongoose.Schema({
  fiscalYear: { type: String, required: true, index: true },
  type: { type: String, default: 'invoice' },
  seq: { type: Number, default: 0 }
}, {
  timestamps: true
});

invoiceSequenceSchema.index({ fiscalYear: 1, type: 1 }, { unique: true });

const InvoiceSequenceModel = mongoose.models.InvoiceSequence || mongoose.model('InvoiceSequence', invoiceSequenceSchema);

// In-process atomic lock mutex - DEV ONLY fallback for store.json
let devSequenceMutex = Promise.resolve();

function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

class InvoiceSequence {
  static get schema() {
    return invoiceSequenceSchema;
  }

  static get mongooseModel() {
    return InvoiceSequenceModel;
  }

  /**
   * Returns current Indian Financial Year
   */
  static getFiscalYear(date) {
    return getIndianFinancialYear(date);
  }

  /**
   * Atomically claims the next sequential invoice number for the given fiscal year.
   * - In production / real MongoDB: Uses atomic $inc with upsert via Mongoose findOneAndUpdate.
   *   Guaranteed gap-free, non-blocking, and unique across any cluster/multi-node environment.
   * - In local dev without MongoDB: Uses dev-only in-process mutex on store.json.
   * @param {Date} date
   * @param {string} prefix (default: 'CE')
   * @param {string} type (default: 'invoice')
   * @returns {Promise<string>} e.g. 'CE/2026-27/000001' or 'CE-CN/2026-27/000001'
   */
  static async claimNext(date = new Date(), prefix = 'CE', type = 'invoice') {
    const fy = getIndianFinancialYear(date);

    if (isMongoConnected()) {
      // PURE MONGOOSE ATOMIC INCREMENT - no mutex, no storeAdapter
      const record = await InvoiceSequenceModel.findOneAndUpdate(
        { fiscalYear: fy, type },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      return `${prefix}/${fy}/${String(record.seq).padStart(6, '0')}`;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: InvoiceSequence cannot use dev store fallback in production. MongoDB connection is required.');
    }

    // DEV ONLY fallback for store.json using in-process mutex
    const claimOperation = async () => {
      const store = readStore();
      
      if (!store.invoiceSequences) {
        store.invoiceSequences = {};
      }

      const seqKey = `${fy}_${type}`;
      const currentSeq = Number(store.invoiceSequences[seqKey] || store.invoiceSequences[fy]) || 0;
      const nextSeq = currentSeq + 1;
      
      store.invoiceSequences[seqKey] = nextSeq;
      writeStore(store);

      const formattedNumber = `${prefix}/${fy}/${String(nextSeq).padStart(6, '0')}`;
      return formattedNumber;
    };

    // Serialize access through devSequenceMutex
    const nextPromise = devSequenceMutex.then(claimOperation);
    devSequenceMutex = nextPromise.catch(() => {});
    return nextPromise;
  }

  /**
   * Atomically claims the next sequential Credit Note number for refunds.
   * Format: CE-CN/YYYY-YY/000001
   * @param {Date} date
   * @returns {Promise<string>} e.g. 'CE-CN/2026-27/000001'
   */
  static async claimNextCreditNote(date = new Date()) {
    return this.claimNext(date, 'CE-CN', 'credit_note');
  }

  /**
   * Ensures an order has an invoice number, claiming one atomically if not yet assigned
   * @param {object} order 
   * @returns {Promise<string>}
   */
  static async getOrAssignForOrder(order) {
    if (order.invoiceNumber) {
      return order.invoiceNumber;
    }
    const invNo = await this.claimNext(order.createdAt ? new Date(order.createdAt) : new Date());
    order.invoiceNumber = invNo;
    return invNo;
  }
}

module.exports = InvoiceSequence;
