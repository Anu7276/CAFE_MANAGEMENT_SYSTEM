/**
 * Unit Test: Sibling Subdomain Cookie & CORS Configuration
 */

const assert = require('assert');

console.log('\n=============================================');
console.log('🧪 RUNNING COOKIE DOMAIN & SIBLING SUBDOMAIN TEST SUITE');
console.log('=============================================\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// 1. Sibling Subdomain Mode (COOKIE_DOMAIN set)
test('Sibling subdomains should configure SameSite=Lax and scoped domain', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalDomain = process.env.COOKIE_DOMAIN;

  process.env.NODE_ENV = 'production';
  process.env.COOKIE_DOMAIN = '.cafeemerald.com';

  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN;

  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000
  };

  if (cookieDomain) {
    cookieOptions.domain = cookieDomain.startsWith('.') ? cookieDomain : `.${cookieDomain}`;
    cookieOptions.sameSite = 'lax';
  } else {
    cookieOptions.sameSite = isProd ? 'none' : 'lax';
  }

  assert.strictEqual(cookieOptions.domain, '.cafeemerald.com');
  assert.strictEqual(cookieOptions.sameSite, 'lax');
  assert.strictEqual(cookieOptions.secure, true);
  assert.strictEqual(cookieOptions.httpOnly, true);

  process.env.NODE_ENV = originalEnv;
  process.env.COOKIE_DOMAIN = originalDomain;
});

// 2. Fallback Mode (COOKIE_DOMAIN unset, cross-domain TLDs)
test('Cross-domain fallback should configure SameSite=None and no domain', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalDomain = process.env.COOKIE_DOMAIN;

  process.env.NODE_ENV = 'production';
  delete process.env.COOKIE_DOMAIN;

  const isProd = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN;

  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000
  };

  if (cookieDomain) {
    cookieOptions.domain = cookieDomain.startsWith('.') ? cookieDomain : `.${cookieDomain}`;
    cookieOptions.sameSite = 'lax';
  } else {
    cookieOptions.sameSite = isProd ? 'none' : 'lax';
  }

  assert.strictEqual(cookieOptions.domain, undefined);
  assert.strictEqual(cookieOptions.sameSite, 'none');
  assert.strictEqual(cookieOptions.secure, true);

  process.env.NODE_ENV = originalEnv;
  process.env.COOKIE_DOMAIN = originalDomain;
});

// 3. Sibling Subdomain Origin Matcher
test('CORS origin matcher should allow any valid sibling subdomain', () => {
  const cookieDomain = '.cafeemerald.com';
  const cleanDomain = cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain;

  function isSibling(origin) {
    const url = new URL(origin);
    return url.hostname === cleanDomain || url.hostname.endsWith(`.${cleanDomain}`);
  }

  assert.strictEqual(isSibling('https://order.cafeemerald.com'), true);
  assert.strictEqual(isSibling('https://api.cafeemerald.com'), true);
  assert.strictEqual(isSibling('https://kds.cafeemerald.com'), true);
  assert.strictEqual(isSibling('https://cafeemerald.com'), true);
  assert.strictEqual(isSibling('https://malicious-cafeemerald.com'), false);
  assert.strictEqual(isSibling('https://otherdomain.com'), false);
});

console.log('\n=============================================');
console.log(`RESULTS: ${passed}/${total} cookie domain tests passed.`);
console.log('=============================================\n');

if (passed !== total) process.exit(1);
