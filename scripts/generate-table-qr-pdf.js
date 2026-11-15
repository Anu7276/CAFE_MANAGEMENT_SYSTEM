/**
 * Table QR Code Stand & Tent Card Generator (PDF + HTML)
 * Generates print-ready acrylic table stand cards for Tables 1..N with cryptographically signed QR links.
 *
 * Usage:
 *   node scripts/generate-table-qr-pdf.js --tables 20 --url https://order.cafeemerald.com
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require(path.resolve(__dirname, '../server/node_modules/qrcode'));
const PDFDocument = require(path.resolve(__dirname, '../server/node_modules/pdfkit/js/pdfkit.js'));

// Parse CLI options
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return defaultValue;
}

const TOTAL_TABLES = Math.max(1, Math.min(200, Number(getArg('tables', 20))));
const PUBLIC_URL = getArg('url', process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
const SECRET = getArg('secret', process.env.TABLE_SIGNING_SECRET || process.env.TABLE_TOKEN_SECRET || 'emerald_table_token_default_secret_key');
const OUTPUT_DIR = path.resolve(__dirname, '../dist_pilot');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function generateTableSig(table, secret) {
  return crypto.createHmac('sha256', secret).update(String(table)).digest('hex').slice(0, 32);
}

async function generateStands() {
  console.log('\n=============================================================');
  console.log('🖨️ CAFÉ EMERALD — TABLE QR STANDS GENERATOR');
  console.log(`📊 Generating stands for Tables 1 to ${TOTAL_TABLES}`);
  console.log(`🌐 Base URL: ${PUBLIC_URL}`);
  console.log('=============================================================\n');

  const pdfPath = path.join(OUTPUT_DIR, `table_qr_stands_1_to_${TOTAL_TABLES}.pdf`);
  const htmlPath = path.join(OUTPUT_DIR, `table_qr_stands_1_to_${TOTAL_TABLES}.html`);

  const doc = new PDFDocument({
    size: 'A5',
    margin: 30,
    layout: 'portrait'
  });

  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  const htmlCards = [];

  for (let table = 1; table <= TOTAL_TABLES; table++) {
    const sig = generateTableSig(table, SECRET);
    const tableUrl = `${PUBLIC_URL}/t/${table}?sig=${sig}`;

    // Generate high-res QR code buffer
    const qrPngBuffer = await QRCode.toBuffer(tableUrl, {
      type: 'png',
      width: 400,
      margin: 1,
      color: {
        dark: '#071a12',
        light: '#ffffff'
      }
    });

    const qrDataUrl = await QRCode.toDataURL(tableUrl, {
      width: 400,
      margin: 1,
      color: {
        dark: '#071a12',
        light: '#ffffff'
      }
    });

    if (table > 1) {
      doc.addPage();
    }

    // PDF Card Styling (A5 Portrait Table Stand)
    // Dark Emerald Outer Border
    doc.lineWidth(2).strokeColor('#0c2f21').rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();
    // Inner Accent Border
    doc.lineWidth(0.5).strokeColor('#4ade80').rect(25, 25, doc.page.width - 50, doc.page.height - 50).stroke();

    // Café Header
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#071a12').text('CAFÉ EMERALD', 0, 50, { align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text('Artisanal Coffee & Gourmet Bakery', 0, 78, { align: 'center' });

    // Table Badge
    doc.rect(doc.page.width / 2 - 70, 105, 140, 34).fillAndStroke('#0c2f21', '#4ade80');
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff').text(`TABLE ${table}`, 0, 114, { align: 'center' });

    // QR Code Image
    doc.image(qrPngBuffer, doc.page.width / 2 - 110, 160, { width: 220, height: 220 });

    // Call to Action
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#071a12').text('Scan with Phone Camera', 0, 400, { align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Browse Menu · Place Order · Pay via UPI / Card', 0, 420, { align: 'center' });

    // Free WiFi Badge
    doc.rect(doc.page.width / 2 - 100, 455, 200, 32).fillAndStroke('#f3f4f6', '#e5e7eb');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text('📶 Free Café WiFi: Emerald-Guest', 0, 462, { align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text('Password: coffeeemerald', 0, 474, { align: 'center' });

    // Footer Security Notice
    doc.font('Helvetica').fontSize(7).fillColor('#9ca3af').text(`Tamper-Proof Table Token: ${sig.slice(0, 12)}...`, 0, 520, { align: 'center' });

    // Collect HTML card for direct browser printing
    htmlCards.push(`
      <div class="card">
        <div class="header">
          <div class="brand">CAFÉ EMERALD</div>
          <div class="tagline">Artisanal Coffee & Gourmet Bakery</div>
        </div>
        <div class="table-badge">TABLE ${table}</div>
        <div class="qr-container">
          <img src="${qrDataUrl}" alt="Table ${table} QR" />
        </div>
        <div class="cta-title">Scan with Phone Camera</div>
        <div class="cta-subtitle">Browse Menu · Order · Instant UPI Payment</div>
        <div class="wifi-box">
          <div class="wifi-title">📶 Complimentary Guest WiFi</div>
          <div class="wifi-desc">Network: <strong>Emerald-Guest</strong> | Pass: <strong>coffeeemerald</strong></div>
        </div>
        <div class="security-tag">Signed Security Token: ${sig.slice(0, 12)}...</div>
      </div>
    `);

    console.log(`  ✓ Generated Stand for Table ${table} (sig: ${sig.slice(0, 8)}...)`);
  }

  doc.end();

  // Create High-Quality HTML Print Template
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Café Emerald — Printable Table QR Stands (Tables 1..${TOTAL_TABLES})</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 20px;
      color: #071a12;
    }
    .print-controls {
      max-width: 800px;
      margin: 0 auto 20px auto;
      background: #fff;
      padding: 16px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .print-btn {
      background: #0c2f21;
      color: #fff;
      border: none;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      max-width: 1000px;
      margin: 0 auto;
    }
    .card {
      background: #ffffff;
      border: 3px solid #0c2f21;
      border-radius: 20px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
      page-break-inside: avoid;
    }
    .brand {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1px;
      color: #071a12;
    }
    .tagline {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .table-badge {
      display: inline-block;
      margin-top: 14px;
      background: #0c2f21;
      color: #ffffff;
      font-size: 15px;
      font-weight: 800;
      padding: 6px 20px;
      border-radius: 9999px;
      border: 1px solid #4ade80;
    }
    .qr-container {
      margin: 16px auto;
      padding: 8px;
      display: inline-block;
      background: #fff;
      border: 2px solid #e2e8f0;
      border-radius: 16px;
    }
    .qr-container img {
      width: 180px;
      height: 180px;
      display: block;
    }
    .cta-title {
      font-size: 13px;
      font-weight: 800;
      color: #071a12;
    }
    .cta-subtitle {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .wifi-box {
      margin-top: 14px;
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      padding: 6px 12px;
      font-size: 10px;
    }
    .wifi-title {
      font-weight: 700;
      color: #334155;
    }
    .wifi-desc {
      color: #64748b;
      font-size: 9px;
      margin-top: 2px;
    }
    .security-tag {
      margin-top: 10px;
      font-size: 8px;
      color: #94a3b8;
      font-family: monospace;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .print-controls { display: none; }
      .grid { display: block; }
      .card { page-break-after: always; margin-bottom: 20mm; }
    }
  </style>
</head>
<body>
  <div class="print-controls">
    <h2>🖨️ Café Emerald — Table QR Stands (Tables 1..${TOTAL_TABLES})</h2>
    <p>Click print below to generate high-resolution acrylic table tent inserts.</p>
    <button class="print-btn" onclick="window.print()">Print Table Stands (A4 / A5)</button>
  </div>
  <div class="grid">
    ${htmlCards.join('')}
  </div>
</body>
</html>
  `;

  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  writeStream.on('finish', () => {
    console.log('\n=============================================================');
    console.log('✨ TABLE STANDS GENERATION COMPLETE');
    console.log(`📄 PDF Document: ${pdfPath}`);
    console.log(`🌐 HTML Print Sheet: ${htmlPath}`);
    console.log('=============================================================\n');
    process.exit(0);
  });
}

generateStands().catch(err => {
  console.error('Fatal stand generator error:', err);
  process.exit(1);
});
