import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderReceiptHtml } from '../src/printing/htmlReceipt.js';
import { buildReceipt } from '../src/printing/receiptModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const formatMoney = (n) => {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}KSh ${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const sampleSaleData = {
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
  showLogo: true,
  logoUrl: null,
  qrEnabled: true,
  publicAppUrl: 'https://app.zana.pos',
};

const receipt = buildReceipt(sampleSaleData, {
  business: businessData,
  receiptSettings,
});

const html80 = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });
const html58 = renderReceiptHtml(receipt, { widthMm: 58, formatMoney });

const previewHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Zana POS — Target Receipt Redesign Preview</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #2563eb;
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
      max-width: 900px;
      margin: 0 auto 32px;
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
      gap: 12px;
      margin-top: 16px;
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
    .preview-container {
      max-width: 1000px;
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
      height: 760px;
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
    <h1>Zana POS — Target Receipt Redesign Preview</h1>
    <p class="subtitle">Pixel-accurate roll thermal receipts rendered with pure semantic HTML and print-first styling</p>
    <div class="specs-badge">
      <span>Layout: <strong>Roll-style (Light theme)</strong></span>
      <span>•</span>
      <span>Typography: <strong>System Sans + Monospace Meta</strong></span>
      <span>•</span>
      <span>Assets: <strong>Zero External Requests</strong></span>
    </div>
  </header>

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
        <iframe src="receipt-80mm.html" width="310" title="80mm Receipt Preview"></iframe>
      </div>
      <div class="actions">
        <a class="btn" href="receipt-80mm.html" target="_blank">Open 80mm Standalone</a>
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
        <iframe src="receipt-58mm.html" width="230" title="58mm Receipt Preview"></iframe>
      </div>
      <div class="actions">
        <a class="btn" href="receipt-58mm.html" target="_blank">Open 58mm Standalone</a>
      </div>
    </div>
  </div>
</body>
</html>
`;

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

  fs.writeFileSync(path.join(dir, 'preview.html'), previewHtml, 'utf8');
  fs.writeFileSync(path.join(dir, 'receipt-80mm.html'), html80, 'utf8');
  fs.writeFileSync(path.join(dir, 'receipt-58mm.html'), html58, 'utf8');
}

console.log('✓ Receipt preview generated successfully!');
console.log(`  Preview file: ${path.join(targetDirs[0], 'preview.html')}`);
console.log(`  80mm sample:  ${path.join(targetDirs[0], 'receipt-80mm.html')}`);
console.log(`  58mm sample:  ${path.join(targetDirs[0], 'receipt-58mm.html')}`);
