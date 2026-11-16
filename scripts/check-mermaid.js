#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Polyfill DOMPurify.sanitize in Node environment before Mermaid initializes
try {
  const dpModule = await import('dompurify');
  const DOMPurify = dpModule.default || dpModule;
  if (!DOMPurify.sanitize) {
    DOMPurify.sanitize = (str) => (typeof str === 'string' ? str : '');
  }
  globalThis.DOMPurify = DOMPurify;
} catch (e) {
  globalThis.DOMPurify = {
    sanitize: (str) => (typeof str === 'string' ? str : '')
  };
}

// Dynamically resolve mermaid
let mermaid;
try {
  const m = await import('mermaid');
  mermaid = m.default || m;
} catch (err) {
  try {
    const serverMermaid = path.resolve(ROOT_DIR, 'server/node_modules/mermaid/dist/mermaid.esm.mjs');
    const m = await import(`file://${serverMermaid.replace(/\\/g, '/')}`);
    mermaid = m.default || m;
  } catch (err2) {
    console.error('❌ Failed to load mermaid library. Ensure "mermaid" is installed in devDependencies.');
    console.error(err.message);
    process.exit(1);
  }
}

// Initialize mermaid
if (mermaid.initialize) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    suppressErrorRendering: true
  });
}

function findMarkdownFiles() {
  const files = [];

  const readmePath = path.join(ROOT_DIR, 'README.md');
  if (fs.existsSync(readmePath)) {
    files.push(readmePath);
  }

  const docsDir = path.join(ROOT_DIR, 'docs');
  if (fs.existsSync(docsDir)) {
    const docFiles = fs.readdirSync(docsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(docsDir, f));
    files.push(...docFiles);
  }

  return files;
}

function extractMermaidBlocks(content) {
  const blocks = [];
  const lines = content.split(/\r?\n/);
  let insideBlock = false;
  let currentBlockLines = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!insideBlock && line.trim().startsWith('```mermaid')) {
      insideBlock = true;
      startLine = i + 1; // 1-indexed
      currentBlockLines = [];
    } else if (insideBlock && line.trim() === '```') {
      insideBlock = false;
      blocks.push({
        startLine,
        endLine: i + 1,
        code: currentBlockLines.join('\n').trim()
      });
      currentBlockLines = [];
    } else if (insideBlock) {
      currentBlockLines.push(line);
    }
  }

  return blocks;
}

async function run() {
  console.log('🔍 Checking Mermaid diagrams in README.md and docs/*.md...\n');

  const files = findMarkdownFiles();
  let totalBlocks = 0;
  let passedBlocks = 0;
  let failedBlocks = 0;
  const failures = [];

  for (const filePath of files) {
    const relPath = path.relative(ROOT_DIR, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const blocks = extractMermaidBlocks(content);

    if (blocks.length === 0) continue;

    console.log(`📄 ${relPath} (${blocks.length} diagram${blocks.length > 1 ? 's' : ''})`);

    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const blockNum = index + 1;
      totalBlocks++;

      try {
        await mermaid.parse(block.code);
        passedBlocks++;
        console.log(`   ✅ Block #${blockNum} (lines ${block.startLine}-${block.endLine}): Valid`);
      } catch (err) {
        failedBlocks++;
        const errorMessage = err.str || err.message || String(err);
        failures.push({
          file: relPath,
          blockNum,
          startLine: block.startLine,
          endLine: block.endLine,
          error: errorMessage,
          code: block.code
        });
        console.error(`   ❌ Block #${blockNum} (lines ${block.startLine}-${block.endLine}): Syntax Error`);
        console.error(`      ${errorMessage.replace(/\n/g, '\n      ')}`);
      }
    }
    console.log('');
  }

  console.log('==================================================');
  console.log(`📊 Summary: Checked ${files.length} files, ${totalBlocks} Mermaid diagrams.`);
  console.log(`   ✅ Passed: ${passedBlocks}`);
  console.log(`   ❌ Failed: ${failedBlocks}`);
  console.log('==================================================');

  if (failedBlocks > 0) {
    console.error('\n❌ Mermaid syntax validation failed!');
    for (const f of failures) {
      console.error(`- ${f.file} [Block #${f.blockNum}, line ${f.startLine}]: ${f.error.split('\n')[0]}`);
    }
    process.exit(1);
  } else {
    console.log('\n✨ All Mermaid diagrams are valid!');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Fatal error running mermaid validation:', err);
  process.exit(1);
});
