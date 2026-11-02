import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const { generatePDF } = await import('../frontend/src/utils/documentGenerator.js');
  const { generateExcel } = await import('../frontend/src/utils/excelGenerator.js');

  const downloadsDir = path.resolve(__dirname, '../downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const sampleIdentity = {
    displayName: 'SokoSafi Supermarket — CBD Branch',
    organizationName: 'SokoSafi Supermarket',
    shopName: 'CBD Branch',
    address: 'Kenyatta Avenue, Nairobi',
    phone: '+254 711 223 344',
    email: 'cbd@sokosafi.co.ke',
    kraPin: 'P051234567Z',
    vatRegistered: true,
    currency: 'KES',
    currencySymbol: 'KSh',
    showPoweredBy: true,
    printedBy: 'Warren Chris',
  };

  const sampleSummaryCards = [
    { label: 'Total Revenue', value: 'KSh 1,485,250.00' },
    { label: 'Total Orders', value: '1,420' },
    { label: 'Net Profit', value: 'KSh 325,400.00' },
    { label: 'Returns', value: '-KSh 12,500.00' },
  ];

  const sampleColumns = [
    { header: 'Ref / Date', key: 'ref', dataKey: 'ref', width: 32, align: 'left' },
    { header: 'Description', key: 'desc', dataKey: 'desc', width: 55, align: 'left' },
    { header: 'Category', key: 'cat', dataKey: 'cat', width: 28, align: 'left' },
    { header: 'Qty', key: 'qty', dataKey: 'qty', width: 16, align: 'center', type: 'quantity' },
    { header: 'Unit Price', key: 'price', dataKey: 'price', width: 26, align: 'right', type: 'currency' },
    { header: 'Net Total', key: 'total', dataKey: 'total', width: 28, align: 'right', type: 'currency' },
  ];

  // Generate 45 rows so it naturally paginates across 2 pages in PDF
  const sampleRows = [];
  for (let i = 1; i <= 45; i++) {
    const isNegative = i === 15 || i === 32;
    const qty = isNegative ? -1 : (i % 5) + 1;
    const price = 250 + (i * 15);
    const total = qty * price;
    sampleRows.push({
      ref: `INV-2026-${String(i).padStart(4, '0')}`,
      desc: isNegative ? `Returned Item Reversal #${i}` : `Premium Grocery Item #${i} Grade A`,
      cat: i % 2 === 0 ? 'Food & Beverage' : 'Household Essentials',
      qty: qty,
      price: price,
      total: total,
    });
  }

  const sampleSummaryRow = ['TOTAL / BALANCE', '45 Transactions Audited', '', 92, '', 'KSh 1,485,250.00'];

  console.log('Generating PDF artifact...');
  const pdfResult = await generatePDF({
    title: 'AUDITED SALES & REVENUE REPORT',
    subtitle: 'Reporting Period: October 1, 2026 — October 31, 2026',
    documentNumber: 'REP-2026-OCT-CBD',
    identity: sampleIdentity,
    meta: [
      { label: 'Terminal', value: 'POS-01' },
      { label: 'Scope', value: 'All Categories' },
    ],
    summaryCards: sampleSummaryCards,
    columns: sampleColumns,
    rows: sampleRows,
    summaryRow: sampleSummaryRow,
    save: false,
  });

  const pdfPath = path.join(downloadsDir, 'verified-sales-report.pdf');
  fs.writeFileSync(pdfPath, Buffer.from(pdfResult.buffer));
  console.log(`PDF written to ${pdfPath} (${fs.statSync(pdfPath).size} bytes, ${pdfResult.pageCount} pages)`);

  console.log('Generating Excel artifact...');
  const excelResult = await generateExcel({
    fileName: 'verified-sales-report.xlsx',
    title: 'AUDITED SALES & REVENUE REPORT',
    subtitle: 'Reporting Period: October 1, 2026 — October 31, 2026',
    identity: sampleIdentity,
    meta: [
      { label: 'Terminal', value: 'POS-01' },
      { label: 'Scope', value: 'All Categories' },
    ],
    columns: sampleColumns,
    rows: sampleRows,
    summaryRow: ['TOTAL', '45 Transactions', '', 92, '', 1485250],
    save: false,
  });

  const xlsxPath = path.join(downloadsDir, 'verified-sales-report.xlsx');
  fs.writeFileSync(xlsxPath, Buffer.from(excelResult.buffer));
  console.log(`Excel written to ${xlsxPath} (${fs.statSync(xlsxPath).size} bytes)`);

  // Verify SheetJS Workbook structure
  const xlsxMod = await import('../frontend/node_modules/xlsx/xlsx.mjs');
  const xlsx = xlsxMod.default || xlsxMod;
  const readWb = xlsx.read(fs.readFileSync(xlsxPath), { type: 'buffer', cellStyles: true });
  const sheet = readWb.Sheets['Report'];
  
  console.log('\n--- EXCEL INSPECTION RESULTS ---');
  console.log('Sheet Names:', readWb.SheetNames);
  console.log('Views/Freeze Panes (!views):', JSON.stringify(sheet['!views']));
  console.log('Column Widths count (!cols):', sheet['!cols']?.length);
  console.log('First 3 Column Widths:', sheet['!cols']?.slice(0, 3));
  
  // Header row is row 7
  console.log('Header Row 7 Col D:', sheet['D7']);
  // Data starts at row 8
  console.log('Item 1 Qty (Row 8, Col D):', sheet['D8']);
  console.log('Item 1 Price (Row 8, Col E):', sheet['E8']);
  console.log('Item 1 Total (Row 8, Col F):', sheet['F8']);
  // Item 15 is row 22 (7 + 15 = 22)
  console.log('Item 15 Reversal Qty (Row 22, Col D):', sheet['D22']);
  console.log('Item 15 Reversal Total (Row 22, Col F):', sheet['F22']);
  // Summary row is row 53 (7 + 45 + 1 = 53)
  console.log('Totals Row 53 Col D (Qty Sum):', sheet['D53']);
  console.log('Totals Row 53 Col F (Total Amount):', sheet['F53']);

  // Inspect PDF binary text
  const pdfRaw = fs.readFileSync(pdfPath, 'latin1');
  console.log('\n--- PDF INSPECTION RESULTS ---');
  console.log('PDF File Size:', fs.statSync(pdfPath).size, 'bytes');
  console.log('PDF Has Page 1 of 3:', pdfRaw.includes('Page 1 of 3'));
  console.log('PDF Has Page 2 of 3:', pdfRaw.includes('Page 2 of 3'));
  console.log('PDF Has Page 3 of 3:', pdfRaw.includes('Page 3 of 3'));
  console.log('PDF Has Business Header:', pdfRaw.includes('SOKOSAFI SUPERMARKET'));
  console.log('PDF Has Tax PIN:', pdfRaw.includes('P051234567Z'));
  console.log('PDF Has Document REF:', pdfRaw.includes('REF: REP-2026-OCT-CBD'));
  console.log('PDF Has Summary Tile:', pdfRaw.includes('TOTAL REVENUE'));
  console.log('PDF Has Reversal Item:', pdfRaw.includes('Returned Item Reversal #15'));
  console.log('PDF Has Powered by Zana POS:', pdfRaw.includes('Powered by Zana POS'));

  console.log('\nArtifact verification completed successfully!');
}

main().catch(err => {
  console.error('Artifact verification failed:', err);
  process.exit(1);
});
