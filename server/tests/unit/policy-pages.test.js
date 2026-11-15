/**
 * Unit Test: Legal Policy Pages for Razorpay Live Activation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n=============================================');
console.log('🧪 RUNNING LEGAL POLICY PAGES TEST SUITE');
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

// 1. Policy Page Component Exists and Implements Required Razorpay Disclosures
test('LegalPolicyPage implements Privacy, Terms, and Refund/Cancellation disclosures', () => {
  const policyPagePath = path.resolve(__dirname, '../../../client/src/pages/LegalPolicyPage.jsx');
  assert.ok(fs.existsSync(policyPagePath), 'LegalPolicyPage.jsx must exist');

  const content = fs.readFileSync(policyPagePath, 'utf8');
  assert.ok(content.includes('Privacy Policy'), 'Must include Privacy Policy header');
  assert.ok(content.includes('Terms & Conditions'), 'Must include Terms of Service header');
  assert.ok(content.includes('Refund & Cancellation'), 'Must include Refund & Cancellation header');
  assert.ok(content.includes('5 to 7 business days'), 'Must include standard Indian payment gateway refund timeline (5-7 business days)');
  assert.ok(content.includes('Razorpay'), 'Must identify Razorpay as payment gateway partner');
  assert.ok(content.includes('Merchant & Grievance Contact'), 'Must provide grievance officer / merchant contact details');
});

// 2. App.jsx registers public routes
test('App.jsx registers /privacy, /terms, and /refunds public routes', () => {
  const appPath = path.resolve(__dirname, '../../../client/src/App.jsx');
  const appCode = fs.readFileSync(appPath, 'utf8');

  assert.ok(appCode.includes('path="/privacy"'), 'Route /privacy must be defined');
  assert.ok(appCode.includes('path="/terms"'), 'Route /terms must be defined');
  assert.ok(appCode.includes('path="/refunds"'), 'Route /refunds must be defined');
});

// 3. Customer Footer in MenuPage links to policies
test('MenuPage customer footer links to /privacy, /terms, and /refunds', () => {
  const menuPath = path.resolve(__dirname, '../../../client/src/pages/MenuPage.jsx');
  const menuCode = fs.readFileSync(menuPath, 'utf8');

  assert.ok(menuCode.includes('to="/privacy"'), 'Footer must link to /privacy');
  assert.ok(menuCode.includes('to="/terms"'), 'Footer must link to /terms');
  assert.ok(menuCode.includes('to="/refunds"'), 'Footer must link to /refunds');
});

console.log('\n=============================================');
console.log(`RESULTS: ${passed}/${total} PASSED`);
console.log('=============================================\n');

if (passed !== total) process.exit(1);
