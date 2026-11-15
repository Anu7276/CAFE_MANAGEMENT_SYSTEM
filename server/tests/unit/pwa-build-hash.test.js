/**
 * Unit Test: Automated PWA Service Worker Cache Version Generation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('\n=============================================');
console.log('🧪 RUNNING PWA AUTOMATED CACHE VERSION TEST SUITE');
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

// 1. Verify placeholder in client/public/sw.js
test('Source sw.js contains placeholder token __SW_CACHE_VERSION__', () => {
  const sourceSwPath = path.resolve(__dirname, '../../../client/public/sw.js');
  const sourceSw = fs.readFileSync(sourceSwPath, 'utf8');
  assert.ok(sourceSw.includes('__SW_CACHE_VERSION__'), 'Source sw.js must have placeholder token');
});

// 2. Verify dist/sw.js has replaced hash and no placeholder
test('Built dist/sw.js contains stamped build hash and no placeholder', () => {
  const distSwPath = path.resolve(__dirname, '../../../client/dist/sw.js');
  if (!fs.existsSync(distSwPath)) {
    throw new Error('client/dist/sw.js not found. Please run npm run build in client.');
  }

  const distSw = fs.readFileSync(distSwPath, 'utf8');
  assert.ok(!distSw.includes('__SW_CACHE_VERSION__'), 'Placeholder must be completely replaced in build');
  
  const versionMatch = distSw.match(/const CACHE_VERSION = ['"]emerald-build-([a-f0-9]{10})['"]/);
  assert.ok(versionMatch, 'Built sw.js must match emerald-build-[10 hex chars] pattern');
  assert.strictEqual(versionMatch[1].length, 10, 'Build hash must be 10 characters');
});

// 3. Verify UpdatePrompt triggers on new worker installation
test('UpdatePrompt registers updatefound and posts SKIP_WAITING to waiting worker', () => {
  const updatePromptPath = path.resolve(__dirname, '../../../client/src/components/UpdatePrompt.jsx');
  const code = fs.readFileSync(updatePromptPath, 'utf8');
  assert.ok(code.includes("addEventListener('updatefound'"), 'UpdatePrompt must listen to updatefound');
  assert.ok(code.includes("postMessage({ type: 'SKIP_WAITING' })"), 'UpdatePrompt must post SKIP_WAITING');
});

console.log('\n=============================================');
console.log(`RESULTS: ${passed}/${total} PASSED`);
console.log('=============================================\n');

if (passed !== total) process.exit(1);
