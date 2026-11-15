const crypto = require('crypto');

const getSecret = () => process.env.TABLE_TOKEN_SECRET || process.env.JWT_SECRET || 'emerald_table_token_default_secret_key';

/**
 * Generate HMAC-SHA256 signature for a table number
 * @param {number|string} table 
 * @returns {string} Hex signature
 */
function generateTableSig(table) {
  const secret = getSecret();
  return crypto.createHmac('sha256', secret).update(String(table)).digest('hex').slice(0, 32);
}

/**
 * Verify if provided signature matches table number
 * @param {number|string} table 
 * @param {string} sig 
 * @returns {boolean}
 */
function verifyTableSig(table, sig) {
  if (!table || !sig) return false;
  const expected = generateTableSig(table);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sig)));
  } catch {
    return false;
  }
}

module.exports = {
  generateTableSig,
  verifyTableSig
};
