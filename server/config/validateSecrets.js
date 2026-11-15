/**
 * Production Secret & Environment Validator
 * Fails fast on startup if critical security tokens are missing, weak, or using dev defaults.
 */

const WEAK_PATTERNS = [
  'emerald_super_secret_cafe_jwt_key_2026',
  'emerald_table_token_default_secret_key',
  'replace_with_strong_random_secret_in_production',
  'replace_with_hmac_secret_for_table_qr_tokens',
  'super_secret_jwt_emerald_key_change_in_production_9988',
  'secret',
  'default_secret',
  'password',
  '12345678',
  'adminpassword123'
];

function validateProductionSecrets() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  const tableSecret = process.env.TABLE_SIGNING_SECRET || process.env.TABLE_TOKEN_SECRET;

  const errors = [];

  // 1. JWT_SECRET Validation
  if (!jwtSecret) {
    errors.push('JWT_SECRET environment variable is missing.');
  } else if (jwtSecret.length < 32) {
    errors.push(`JWT_SECRET is too short (${jwtSecret.length} chars). Must be at least 32 characters in production.`);
  } else if (WEAK_PATTERNS.some(p => jwtSecret.toLowerCase().includes(p.toLowerCase()))) {
    errors.push('JWT_SECRET contains a known weak or sample placeholder secret.');
  }

  // 2. TABLE_SIGNING_SECRET Validation
  if (!tableSecret) {
    errors.push('TABLE_SIGNING_SECRET (or TABLE_TOKEN_SECRET) environment variable is missing.');
  } else if (tableSecret.length < 32) {
    errors.push(`TABLE_SIGNING_SECRET is too short (${tableSecret.length} chars). Must be at least 32 characters in production.`);
  } else if (WEAK_PATTERNS.some(p => tableSecret.toLowerCase().includes(p.toLowerCase()))) {
    errors.push('TABLE_SIGNING_SECRET contains a known weak or sample placeholder secret.');
  }

  if (errors.length > 0) {
    console.error('\n====================================================================');
    console.error('  🛑 FATAL CONFIGURATION ERROR: INSECURE PRODUCTION SECRETS DETECTED');
    console.error('====================================================================');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease set strong, cryptographically generated secrets (>= 32 chars) in your production environment.');
    console.error('====================================================================\n');
    process.exit(1);
  }
}

module.exports = {
  validateProductionSecrets,
  WEAK_PATTERNS
};
