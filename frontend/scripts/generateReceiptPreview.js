import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderReceiptHtml } from '../src/printing/htmlReceipt.js';
import { buildReceipt, buildCreditNote } from '../src/printing/receiptModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const formatMoney = (n) => {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}KSh ${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const businessData = {
  name: 'Zana Supermarket',
  branch: 'Westlands Branch',
  address: 'Ring Road Parklands',
  phone: '0712 345 678',
  kraPin: 'P051234567X',
  tagline: 'Better Products · Brighter Together',
  showPoweredBy: true,
  qrEnabled: true,
  publicAppUrl: 'https://app.zana.pos',
};

const receiptSettings = {
  header: 'Karibu Zana!\nOpen Daily 8:00 AM - 9:00 PM',
  footer: 'Thank you for your business!',
  tagline: 'Better Products · Brighter Together',
  showPoweredBy: true,
  showLogo: false,
  logoUrl: null,
  qrEnabled: true,
  publicAppUrl: 'https://app.zana.pos',
};

// 1. Normal Sale
const normalSale = {
  id: 1042,
  receiptNumber: 'R-D4E1-000042',
  invoiceNumber: 'INV-2026-0042',
  receiptToken: 'aB3_dE9-gH1_jK2-mN3_pQ',
  createdAt: '2026-10-24T14:30:00.000Z',
  cashierName: 'Jane Mwangi',
  customer: { name: 'Peter Karanja' },
  paymentMethod: 'cash',
  paymentAmount: 2500,
  change: 400,
  taxRate: 16,
  taxInclusive: true,
  taxAmount: 289.66,
  subtotal: 2150,
  discount: 50,
  total: 2100,
  notes: '',
  items: [
    { id: 1, name: 'Maize Flour 2kg', quantity: 3, price: 290, total: 870 },
    { id: 2, name: 'Cooking Oil 1L', quantity: 2, price: 350, total: 700 },
    { id: 3, name: 'Sugar 1kg', quantity: 2, price: 165, total: 330 },
    { id: 4, name: 'Prestige Margarine 500g', quantity: 1, price: 250, total: 250 },
  ],
};

// 2. Offline Sale (pending sync banner visible, Invoice: Pending)
const offlineSale = {
  ...normalSale,
  id: 'temp-offline-1043',
  receiptNumber: 'R-D4E1-000043',
  invoiceNumber: null,
  isOffline: true,
  pendingSync: true,
  receiptToken: 'off_sync_pending_token',
};

// 3. Duplicate Copy
const duplicateSale = {
  ...normalSale,
  isDuplicate: true,
};

// 4. Credit Note
const sampleReturnRecord = {
  id: 201,
  creditNoteNumber: 'CN-20261024-0001',
  originalInvoiceNumber: 'INV-2026-0042',
  saleId: 1042,
  createdAt: '2026-10-24T16:15:00.000Z',
  cashierName: 'Jane Mwangi',
  customer: { name: 'Peter Karanja' },
  refundMethod: 'cash',
  refundAmount: 700,
  reason: 'Damaged packaging / seal broken',
  shop: { systemName: 'Zana Supermarket', contactPhone: '0712 345 678' },
  items: [
    { id: 2, name: 'Cooking Oil 1L', quantity: 2, price: 350, total: 700, returnReason: 'Damaged seal' },
  ],
};

// 5. Long Item Name
const longItemSale = {
  ...normalSale,
  items: [
    {
      id: 1,
      name: 'Ungas Extra Fine Fortified Maize Meal Flour 2kg Premium Quality Export Pack (Batch #KE-2026-X992)',
      quantity: 3,
      price: 290,
      total: 870,
    },
    {
      id: 2,
      name: 'Fresh Dairy Pasteurised Homogenised Whole Cow Milk 500ml Pouch Container (Cold Chain Stored)',
      quantity: 4,
      price: 65,
      total: 260,
    },
    { id: 3, name: 'Sugar 1kg', quantity: 2, price: 165, total: 330 },
  ],
  total: 1460,
  subtotal: 1510,
  discount: 50,
  paymentAmount: 2000,
  change: 540,
};

// 6. Sale with Shop Logo
const logoSvgDataUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50" width="160" height="50"><rect width="160" height="50" rx="8" fill="%23111111"/><text x="80" y="32" font-family="sans-serif" font-size="22" font-weight="900" fill="%23ffffff" text-anchor="middle">ZANA</text></svg>';

const variants = [
  {
    key: 'standard',
    name: 'Normal Sale',
    receipt: buildReceipt(normalSale, { business: businessData, receiptSettings }),
    file80: 'receipt-80mm.html',
    file58: 'receipt-58mm.html',
  },
  {
    key: 'offline',
    name: 'Offline Sale (Pending)',
    receipt: buildReceipt(offlineSale, { business: businessData, receiptSettings }),
    file80: 'receipt-offline-80mm.html',
    file58: 'receipt-offline-58mm.html',
  },
  {
    key: 'duplicate',
    name: 'Duplicate Copy',
    receipt: buildReceipt(duplicateSale, { business: businessData, receiptSettings, isDuplicate: true }),
    file80: 'receipt-duplicate-80mm.html',
    file58: 'receipt-duplicate-58mm.html',
  },
  {
    key: 'credit-note',
    name: 'Credit Note',
    receipt: buildCreditNote(sampleReturnRecord, { business: businessData, receiptSettings }),
    file80: 'receipt-credit-note-80mm.html',
    file58: 'receipt-credit-note-58mm.html',
  },
  {
    key: 'long-item',
    name: 'Long Item Name',
    receipt: buildReceipt(longItemSale, { business: businessData, receiptSettings }),
    file80: 'receipt-long-item-80mm.html',
    file58: 'receipt-long-item-58mm.html',
  },
  {
    key: 'with-logo',
    name: 'Sale with Shop Logo',
    receipt: buildReceipt(normalSale, {
      business: businessData,
      receiptSettings: { ...receiptSettings, showLogo: true, logoUrl: logoSvgDataUrl },
    }),
    file80: 'receipt-with-logo-80mm.html',
    file58: 'receipt-with-logo-58mm.html',
  },
];

// Target directories: both frontend/receipt-preview and root/receipt-preview
const frontendDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(frontendDir, '..');

const targetDirs = [
  path.join(frontendDir, 'receipt-preview'),
  path.join(rootDir, 'receipt-preview'),
];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write all 12 receipt HTML files
  for (const v of variants) {
    const html80 = renderReceiptHtml(v.receipt, { widthMm: 80, formatMoney });
    const html58 = renderReceiptHtml(v.receipt, { widthMm: 58, formatMoney });
    fs.writeFileSync(path.join(dir, v.file80), html80, 'utf8');
    fs.writeFileSync(path.join(dir, v.file58), html58, 'utf8');
  }
}

// Generate interactive preview.html with tab selector
const previewHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Zana POS — Thermal Receipt Design Preview</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px 16px;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
    }
    header {
      max-width: 960px;
      margin: 0 auto 24px;
      text-align: center;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    p.subtitle {
      margin: 0;
      color: var(--text-muted);
      font-size: 14px;
    }
    .specs-badge {
      display: inline-flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 14px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 6px 16px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .specs-badge strong {
      color: var(--text);
    }
    .tabs-nav {
      max-width: 960px;
      margin: 0 auto 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .tab-btn {
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text-muted);
      transition: all 0.15s ease;
    }
    .tab-btn:hover {
      background: #334155;
      color: var(--text);
    }
    .tab-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
    }
    .preview-container {
      max-width: 1024px;
      margin: 0 auto;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 32px;
      align-items: flex-start;
    }
    .preview-column {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .column-header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .column-title {
      font-size: 15px;
      font-weight: 600;
    }
    .column-meta {
      font-size: 12px;
      color: var(--text-muted);
    }
    .receipt-frame-wrapper {
      background: #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: center;
    }
    iframe {
      border: none;
      background: #fff;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -2px rgba(0, 0, 0, 0.15);
      border-radius: 2px;
      height: 780px;
      overflow: hidden;
    }
    .actions {
      margin-top: 14px;
      width: 100%;
      display: flex;
      justify-content: center;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid var(--border);
      background: #0f172a;
      color: var(--text);
      transition: all 0.15s ease;
    }
    .btn:hover {
      background: #334155;
    }
  </style>
</head>
<body>
  <header>
    <h1>Zana POS — Thermal Receipt Design Preview</h1>
    <p class="subtitle">Pixel-accurate thermal receipts rendered with pure semantic HTML, neutral light-theme, and print-first styling</p>
    <div class="specs-badge">
      <span>Layout: <strong>Neutral Thermal Roll</strong></span>
      <span>•</span>
      <span>Total Bar: <strong>#e5e5e5 Exact</strong></span>
      <span>•</span>
      <span>Assets: <strong>Zero External Requests</strong></span>
    </div>
  </header>

  <nav class="tabs-nav" id="tabsNav">
    ${variants.map((v, i) => `
      <button class="tab-btn ${i === 0 ? 'active' : ''}" data-file80="${v.file80}" data-file58="${v.file58}">
        ${v.name}
      </button>
    `).join('')}
  </nav>

  <div class="preview-container">
    <!-- 80mm Column -->
    <div class="preview-column">
      <div class="column-header">
        <div>
          <div class="column-title">80mm Paper Width</div>
          <div class="column-meta">Standard 80mm counter thermal roll (48 cols)</div>
        </div>
      </div>
      <div class="receipt-frame-wrapper">
        <iframe id="frame80" src="receipt-80mm.html" width="310" title="80mm Receipt Preview"></iframe>
      </div>
      <div class="actions">
        <a id="link80" class="btn" href="receipt-80mm.html" target="_blank">Open 80mm Standalone</a>
      </div>
    </div>

    <!-- 58mm Column -->
    <div class="preview-column">
      <div class="column-header">
        <div>
          <div class="column-title">58mm Paper Width</div>
          <div class="column-meta">Compact 58mm mobile thermal roll (32 cols)</div>
        </div>
      </div>
      <div class="receipt-frame-wrapper">
        <iframe id="frame58" src="receipt-58mm.html" width="230" title="58mm Receipt Preview"></iframe>
      </div>
      <div class="actions">
        <a id="link58" class="btn" href="receipt-58mm.html" target="_blank">Open 58mm Standalone</a>
      </div>
    </div>
  </div>

  <script>
    const buttons = document.querySelectorAll('.tab-btn');
    const frame80 = document.getElementById('frame80');
    const frame58 = document.getElementById('frame58');
    const link80 = document.getElementById('link80');
    const link58 = document.getElementById('link58');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const file80 = btn.getAttribute('data-file80');
        const file58 = btn.getAttribute('data-file58');

        frame80.src = file80;
        frame58.src = file58;
        link80.href = file80;
        link58.href = file58;
      });
    });
  </script>
</body>
</html>
`;

for (const dir of targetDirs) {
  fs.writeFileSync(path.join(dir, 'preview.html'), previewHtml, 'utf8');
}

console.log('✓ All receipt preview variants generated successfully at:');
console.log(`  ${targetDirs[0]}`);
console.log(`  ${targetDirs[1]}`);
