/**
 * Thermal Printer & GST Invoice Generator (80mm standard width)
 */

function generateBillHtml(order, settings) {
  const gstin = settings.gstin || '27AAAAA0000A1Z5';
  const fssai = settings.fssai || '11522018000452';
  const cafeName = settings.cafeName || 'CAFÉ EMERALD';
  const address = settings.address || 'Ground Floor, Emerald Heights, MG Road, Pune, MH 411001';
  const phone = settings.phone || '+91 98765 43210';
  const invoiceNo = `INV-EMR-${order.orderNumber}`;
  const orderTime = new Date(order.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const itemsRows = order.items.map((item, idx) => `
    <tr>
      <td style="padding: 4px 0; text-align: left;">${idx + 1}. ${item.name} ${item.size ? `(${item.size})` : ''}</td>
      <td style="padding: 4px 0; text-align: center;">${item.qty}</td>
      <td style="padding: 4px 0; text-align: right;">₹${item.price}</td>
      <td style="padding: 4px 0; text-align: right;">₹${item.price * item.qty}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice #${order.orderNumber} - ${cafeName}</title>
  <style>
    @media print {
      body { width: 80mm; margin: 0; padding: 4mm; font-size: 11px; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 80mm;
      max-width: 320px;
      margin: 10px auto;
      padding: 12px;
      background: #fff;
      color: #000;
      line-height: 1.3;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .double-divider { border-top: 2px solid #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { border-bottom: 1px dashed #000; padding-bottom: 4px; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border: 1px solid #000;
      font-weight: bold;
      margin-top: 4px;
    }
    .print-btn {
      background: #000;
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-family: sans-serif;
      font-weight: bold;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 12px;
    }
  </style>
</head>
<body>
  <div class="no-print text-center">
    <button class="print-btn" onclick="window.print()">🖨️ Print Customer Bill (80mm)</button>
  </div>

  <div class="text-center">
    <h2 style="margin: 0; font-size: 16px; letter-spacing: 1px;">${cafeName}</h2>
    <p style="margin: 2px 0; font-size: 10px;">${address}</p>
    <p style="margin: 2px 0; font-size: 10px;">Phone: ${phone}</p>
    <p style="margin: 2px 0; font-size: 10px; font-weight: bold;">GSTIN: ${gstin}</p>
    <p style="margin: 2px 0; font-size: 10px;">FSSAI Lic: ${fssai}</p>
    <p style="margin: 2px 0; font-size: 10px;">SAC: 996331 (Restaurant Services)</p>
  </div>

  <div class="divider"></div>

  <div style="font-size: 10px;">
    <div><strong>Tax Invoice:</strong> ${invoiceNo}</div>
    <div><strong>Date & Time:</strong> ${orderTime}</div>
    <div><strong>Table Number:</strong> Table ${order.table}</div>
    <div><strong>Order Token:</strong> ${order.orderToken.slice(0, 8)}...</div>
  </div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th style="text-align: left;">Item</th>
        <th style="text-align: center;">Qty</th>
        <th style="text-align: right;">Rate</th>
        <th style="text-align: right;">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr>
      <td>Item Subtotal:</td>
      <td class="text-right">₹${order.subtotal.toFixed(2)}</td>
    </tr>
    <tr>
      <td>CGST @ 2.5%:</td>
      <td class="text-right">₹${(order.cgst || (order.tax / 2)).toFixed(2)}</td>
    </tr>
    <tr>
      <td>SGST @ 2.5%:</td>
      <td class="text-right">₹${(order.sgst || (order.tax / 2)).toFixed(2)}</td>
    </tr>
    <tr style="font-weight: bold;">
      <td>Total Tax (5% GST):</td>
      <td class="text-right">₹${order.tax.toFixed(2)}</td>
    </tr>
  </table>

  <div class="double-divider"></div>

  <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold;">
    <span>GRAND TOTAL:</span>
    <span>₹${order.total.toFixed(2)}</span>
  </div>

  <div class="divider"></div>

  <div style="font-size: 10px;">
    <div><strong>Payment Method:</strong> ${(order.paymentMethod || 'counter').toUpperCase()}</div>
    <div><strong>Payment Status:</strong> ${(order.paymentStatus || 'pending').toUpperCase()}</div>
    ${order.paidAt ? `<div><strong>Paid At:</strong> ${new Date(order.paidAt).toLocaleTimeString()}</div>` : ''}
  </div>

  <div class="divider"></div>

  <div class="text-center" style="font-size: 10px; margin-top: 8px;">
    <p style="margin: 2px 0;">*** THANK YOU FOR VISITING ***</p>
    <p style="margin: 2px 0;">Have a wonderful day!</p>
    <p style="margin: 2px 0; font-size: 8px;">Computer Generated Tax Invoice</p>
  </div>
</body>
</html>
  `;
}

function generateKotHtml(order) {
  const orderTime = new Date(order.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

  const itemsRows = order.items.map((item, idx) => `
    <tr>
      <td style="padding: 6px 0; font-size: 14px; font-weight: bold; text-align: left;">
        ${idx + 1}. ${item.name} ${item.size ? `<span style="font-size: 11px;">[${item.size}]</span>` : ''}
      </td>
      <td style="padding: 6px 0; font-size: 18px; font-weight: 900; text-align: right;">
        x${item.qty}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>KOT #${order.orderNumber} - Table ${order.table}</title>
  <style>
    @media print {
      body { width: 80mm; margin: 0; padding: 4mm; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 80mm;
      max-width: 320px;
      margin: 10px auto;
      padding: 12px;
      background: #fff;
      color: #000;
      line-height: 1.3;
    }
    .text-center { text-align: center; }
    .divider { border-top: 2px dashed #000; margin: 8px 0; }
    .double-divider { border-top: 3px solid #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    .print-btn {
      background: #000;
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-family: sans-serif;
      font-weight: bold;
      border-radius: 4px;
      cursor: pointer;
      margin-bottom: 12px;
    }
    .badge-table {
      font-size: 24px;
      font-weight: 900;
      border: 3px solid #000;
      padding: 4px 8px;
      display: inline-block;
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="no-print text-center">
    <button class="print-btn" onclick="window.print()">🖨️ Print Kitchen KOT (80mm)</button>
  </div>

  <div class="text-center">
    <h2 style="margin: 0; font-size: 18px; letter-spacing: 2px;">*** KITCHEN ORDER TICKET ***</h2>
    <div class="badge-table">TABLE ${order.table}</div>
    <div style="font-size: 13px; font-weight: bold;">KOT #${order.orderNumber}</div>
    <div style="font-size: 11px;">Time: ${orderTime}</div>
  </div>

  <div class="double-divider"></div>

  <table>
    <thead>
      <tr style="border-bottom: 2px solid #000;">
        <th style="text-align: left; font-size: 12px;">ITEM DESCRIPTION</th>
        <th style="text-align: right; font-size: 12px;">QTY</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  ${order.note ? `
    <div class="divider"></div>
    <div style="background: #eee; padding: 6px; border: 1px dashed #000;">
      <strong style="font-size: 12px;">SPECIAL NOTES / MODIFIERS:</strong>
      <div style="font-size: 13px; font-weight: bold; margin-top: 2px;">⚠️ ${order.note}</div>
    </div>
  ` : ''}

  <div class="double-divider"></div>
  <div class="text-center" style="font-size: 11px; font-weight: bold;">
    [TOTAL ITEMS: ${order.items.reduce((s, i) => s + (Number(i.qty) || 1), 0)}]
  </div>
</body>
</html>
  `;
}

module.exports = {
  generateBillHtml,
  generateKotHtml
};
