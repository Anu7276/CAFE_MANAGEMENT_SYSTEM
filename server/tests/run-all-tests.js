const { execSync } = require('child_process');
const path = require('path');

console.log('\n=============================================================');
console.log('🚀 CAFÉ EMERALD - RUNNING COMPLETE TEST SUITE (PHASES 1-5)');
console.log('=============================================================\n');

const testSuites = [
  { name: 'Phase 1: P0 Security Suite', file: path.resolve(__dirname, '../test-phase1-security.js') },
  { name: 'Phase 2: Admin Management Suite', file: path.resolve(__dirname, '../test-phase2-admin.js') },
  { name: 'Phase 3: Payments & GST Suite', file: path.resolve(__dirname, '../test-phase3-payments.js') },
  { name: 'Phase 4: Realtime Reliability Suite', file: path.resolve(__dirname, '../test-phase4-realtime.js') },
  { name: 'Phase 5: Unit Tests (Pricing & State Machine)', file: path.resolve(__dirname, 'unit/pricing-and-state.test.js') },
  { name: 'Production Unit: Cookie Domain & Subdomains', file: path.resolve(__dirname, 'unit/cookie-domain.test.js') },
  { name: 'Production Unit: Smoke Test Guard & isTest Exclusions', file: path.resolve(__dirname, 'unit/smoke-test-guard.test.js') },
  { name: 'Production Unit: PWA Automated Cache Version', file: path.resolve(__dirname, 'unit/pwa-build-hash.test.js') },
  { name: 'Production Unit: QR Abuse & Payment Gate', file: path.resolve(__dirname, 'unit/qr-abuse.test.js') },
  { name: 'Production Unit: GST Invoice Sequence & Concurrency', file: path.resolve(__dirname, 'unit/invoice-sequence.test.js') },
  { name: 'Production Unit: Legal Policy Pages for Razorpay', file: path.resolve(__dirname, 'unit/policy-pages.test.js') },
  { name: 'Production Unit: Deploy Telemetry & Launch Checklist', file: path.resolve(__dirname, 'unit/deploy-check.test.js') },
  { name: 'Production Unit: Online Payment Setting & Pilot Gate', file: path.resolve(__dirname, 'unit/online-payment-toggle.test.js') },
  { name: 'Phase 5: Supertest REST API Integration', file: path.resolve(__dirname, 'api/supertest.test.js') }
];

let totalPassed = 0;
let totalFailed = 0;

for (const suite of testSuites) {
  try {
    console.log(`\n▶ Executing: ${suite.name}...`);
    execSync(`node "${suite.file}"`, { stdio: 'inherit' });
    totalPassed++;
  } catch (err) {
    console.error(`❌ Suite failed: ${suite.name}`);
    totalFailed++;
  }
}

console.log('\n=============================================================');
console.log(`🏁 FINAL TEST SUMMARY: ${totalPassed}/${testSuites.length} SUITES PASSED`);
console.log('=============================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
