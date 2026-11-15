/**
 * Atomic Gap-Free GST Invoice Sequence Manager
 * Format: CE/YYYY-YY/000001 (e.g., CE/2026-27/000001)
 * Per Indian Financial Year (April 1 to March 31)
 */

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

// In-process atomic lock mutex to guarantee sequential, gap-free assignment even under concurrent calls
let sequenceMutex = Promise.resolve();

class InvoiceSequence {
  /**
   * Returns current Indian Financial Year
   */
  static getFiscalYear(date) {
    return getIndianFinancialYear(date);
  }

  /**
   * Atomically claims the next sequential invoice number for the given fiscal year
   * @param {Date} date
   * @param {string} prefix (default: 'CE')
   * @returns {Promise<string>} e.g. 'CE/2026-27/000001'
   */
  static async claimNext(date = new Date(), prefix = 'CE') {
    const claimOperation = async () => {
      const fy = getIndianFinancialYear(date);
      const store = readStore();
      
      if (!store.invoiceSequences) {
        store.invoiceSequences = {};
      }

      const currentSeq = Number(store.invoiceSequences[fy]) || 0;
      const nextSeq = currentSeq + 1;
      
      store.invoiceSequences[fy] = nextSeq;
      writeStore(store);

      const formattedNumber = `${prefix}/${fy}/${String(nextSeq).padStart(6, '0')}`;
      return formattedNumber;
    };

    // Serialize access through sequenceMutex
    const nextPromise = sequenceMutex.then(claimOperation);
    sequenceMutex = nextPromise.catch(() => {});
    return nextPromise;
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
