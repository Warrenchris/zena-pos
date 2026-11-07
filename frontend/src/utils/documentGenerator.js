/**
 * Zana POS — Unified Document Design System (UDDS)
 * Authoritative Shared PDF Document Generator
 *
 * Built on jsPDF and jsPDF-autotable:
 * - Enterprise financial report styling with Zana Terracotta palette
 * - Standardized multi-page header with business identity & metadata
 * - Repeating table headers on continuation pages
 * - Dynamic running footer ("Page X of Y", generation timestamp, "Powered by Zana POS")
 * - Summary metric cards support
 * - Clean empty dataset presentation
 * - Both browser direct download and in-memory Blob/Buffer generation
 */

import { DOCUMENT_COLORS, DOCUMENT_FONTS, DOCUMENT_GEOMETRY } from './documentTokens.js';

/**
 * Dynamically imports jsPDF and jspdf-autotable across ESM and CommonJS.
 */
async function getPdfLibraries() {
  const jspdfModule = await import('jspdf');
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF || jspdfModule.default;

  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default || autoTableModule;

  return { jsPDF, autoTable };
}

/**
 * Generates a production-ready, standardized PDF document.
 *
 * @param {Object} options - Document configuration
 * @param {string} [options.title='REPORT'] - Main document title
 * @param {string} [options.subtitle] - Subtitle or date period
 * @param {string} [options.documentNumber] - Optional document/voucher/invoice reference number
 * @param {Object} [options.identity] - Authoritative business identity from resolveBusinessIdentity
 * @param {Array<{label: string, value: *}>} [options.meta] - Key-value metadata items
 * @param {Array<{label: string, value: string|number, helper?: string}>} [options.summaryCards] - Top metric tiles
 * @param {Array<Object>} [options.columns] - Table columns [{ header: 'Item', dataKey: 'item', align: 'left', width: 40 }]
 * @param {Array} [options.rows] - Table row data
 * @param {Array} [options.summaryRow] - Optional totals row
 * @param {Array<Object>} [options.tables] - Optional multi-table support
 * @param {string} [options.orientation='portrait'] - 'portrait' or 'landscape'
 * @param {string} [options.fileName='document.pdf'] - Download filename
 * @param {boolean} [options.save=true] - Trigger browser download
 * @returns {Promise<{ success: boolean, doc: Object, blob?: Blob, buffer?: ArrayBuffer }>}
 */
export async function generatePDF(options = {}) {
  const {
    title = 'REPORT',
    subtitle = null,
    documentNumber = null,
    identity = {},
    meta = [],
    summaryCards = null,
    columns = [],
    rows = [],
    summaryRow = null,
    tables = null,
    orientation = 'portrait',
    fileName = 'document.pdf',
    save = true,
  } = options;

  const { jsPDF, autoTable } = await getPdfLibraries();

  const isLandscape = orientation === 'landscape';
  const geometry = isLandscape ? DOCUMENT_GEOMETRY.a4Landscape : DOCUMENT_GEOMETRY.a4Portrait;

  const doc = new jsPDF({
    orientation: isLandscape ? 'l' : 'p',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = geometry.marginMm.left;
  const marginRight = geometry.marginMm.right;
  const printableWidth = pageWidth - marginLeft - marginRight;

  let currentY = geometry.marginMm.top;

  // 1. BUSINESS HEADER BLOCK
  const businessName = (
    identity.displayName ||
    identity.organizationName ||
    'Zana POS'
  ).toUpperCase();

  // Top Terracotta accent bar
  doc.setFillColor(...DOCUMENT_COLORS.primaryRgb);
  doc.rect(0, 0, pageWidth, 3, 'F');

  // Business Name
  doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.bold);
  doc.setFontSize(DOCUMENT_FONTS.sizes.title);
  doc.setTextColor(...DOCUMENT_COLORS.primaryRgb);
  doc.text(businessName, marginLeft, currentY + 4);
  currentY += 8;

  // Business Sub-details (Address, Phone, Tax PIN)
  doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.normal);
  doc.setFontSize(DOCUMENT_FONTS.sizes.metaLabel);
  doc.setTextColor(...DOCUMENT_COLORS.textMutedRgb);

  const contactItems = [];
  if (identity.address) contactItems.push(identity.address);
  if (identity.phone) contactItems.push(`Tel: ${identity.phone}`);
  if (identity.email) contactItems.push(`Email: ${identity.email}`);
  if (identity.kraPin && identity.isValidPin === true) contactItems.push(`PIN: ${identity.kraPin}`);

  if (contactItems.length > 0) {
    doc.text(contactItems.join('  •  '), marginLeft, currentY + 1);
    currentY += 5;
  }

  // Document Title & Right-Hand Reference Block
  doc.setDrawColor(...DOCUMENT_COLORS.borderSubduedRgb);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, currentY + 2, pageWidth - marginRight, currentY + 2);
  currentY += 6;

  // Left: Document Title
  doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.bold);
  doc.setFontSize(DOCUMENT_FONTS.sizes.sectionHeading + 1);
  doc.setTextColor(...DOCUMENT_COLORS.textDarkRgb);
  doc.text(String(title).toUpperCase(), marginLeft, currentY + 4);

  // Right: Document Number / Reference (if provided)
  if (documentNumber) {
    doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.bold);
    doc.setFontSize(DOCUMENT_FONTS.sizes.metaValue);
    doc.setTextColor(...DOCUMENT_COLORS.primaryRgb);
    doc.text(`REF: ${documentNumber}`, pageWidth - marginRight, currentY + 4, { align: 'right' });
  }

  currentY += 6;

  // Subtitle / Period line
  if (subtitle) {
    doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.normal);
    doc.setFontSize(DOCUMENT_FONTS.sizes.metaLabel);
    doc.setTextColor(...DOCUMENT_COLORS.textMutedRgb);
    doc.text(String(subtitle), marginLeft, currentY + 2);
    currentY += 4;
  }

  // Metadata inline badges (e.g., Generated date, Cashier/Operator, Filters)
  const metaBadgeItems = [];
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-KE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Africa/Nairobi',
  }).format(now);
  metaBadgeItems.push({ label: 'Generated', value: dateStr });

  if (identity.printedBy) {
    metaBadgeItems.push({ label: 'By', value: identity.printedBy });
  }

  if (Array.isArray(meta)) {
    meta.forEach(m => {
      if (m && m.label && m.value !== undefined && m.value !== null && m.value !== '') {
        metaBadgeItems.push(m);
      }
    });
  }

  if (metaBadgeItems.length > 0) {
    currentY += 2;
    doc.setFontSize(DOCUMENT_FONTS.sizes.metaLabel);
    const metaText = metaBadgeItems.map(m => `${m.label}: ${m.value}`).join('   |   ');
    const metaLines = doc.splitTextToSize(metaText, printableWidth);
    doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.normal);
    doc.setTextColor(...DOCUMENT_COLORS.textMutedRgb);
    doc.text(metaLines, marginLeft, currentY + 2);
    currentY += Math.max(6, (metaLines.length * 3.5) + 2);
  }

  // 2. SUMMARY METRIC CARDS (if provided)
  if (Array.isArray(summaryCards) && summaryCards.length > 0) {
    currentY += 2;
    const cardGap = 3;
    const cardCount = Math.min(summaryCards.length, 4);
    const cardWidth = (printableWidth - cardGap * (cardCount - 1)) / cardCount;
    const cardHeight = 16;

    for (let i = 0; i < cardCount; i++) {
      const card = summaryCards[i];
      const cardX = marginLeft + i * (cardWidth + cardGap);

      // Card Background & Border
      doc.setFillColor(...DOCUMENT_COLORS.cardBgRgb);
      doc.setDrawColor(...DOCUMENT_COLORS.borderSubduedRgb);
      doc.setLineWidth(0.2);
      doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      // Card Label
      doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.normal);
      doc.setFontSize(7);
      doc.setTextColor(...DOCUMENT_COLORS.textMutedRgb);
      doc.text(String(card.label).toUpperCase(), cardX + 3, currentY + 5);

      // Card Value
      doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.bold);
      doc.setFontSize(10);
      doc.setTextColor(...DOCUMENT_COLORS.textDarkRgb);
      doc.text(String(card.value), cardX + 3, currentY + 11);
    }
    currentY += cardHeight + 6;
  } else {
    currentY += 3;
  }

  // 3. TABLE RENDERING
  const tableConfigs = Array.isArray(tables) && tables.length > 0
    ? tables
    : [{ title: null, columns, rows, summaryRow }];

  for (let tIdx = 0; tIdx < tableConfigs.length; tIdx++) {
    const tableConfig = tableConfigs[tIdx];
    const tableCols = tableConfig.columns || [];
    const tableRows = tableConfig.rows || [];
    const tableSummary = tableConfig.summaryRow || null;
    const tableTitle = tableConfig.title || null;

    if (tableTitle) {
      doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.bold);
      doc.setFontSize(DOCUMENT_FONTS.sizes.sectionHeading);
      doc.setTextColor(...DOCUMENT_COLORS.textDarkRgb);
      doc.text(tableTitle, marginLeft, currentY + 4);
      currentY += 7;
    }

    if (tableRows.length === 0) {
      // Clean Empty Dataset Box
      doc.setFillColor(...DOCUMENT_COLORS.cardBgRgb);
      doc.setDrawColor(...DOCUMENT_COLORS.borderSubduedRgb);
      doc.setLineWidth(0.2);
      doc.roundedRect(marginLeft, currentY, printableWidth, 18, 1.5, 1.5, 'FD');

      doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.italic);
      doc.setFontSize(DOCUMENT_FONTS.sizes.tableBody);
      doc.setTextColor(...DOCUMENT_COLORS.textMutedRgb);
      doc.text('No records found for the selected period.', pageWidth / 2, currentY + 10, { align: 'center' });
      currentY += 24;
      continue;
    }

    // Prepare table headers and body
    const headRow = tableCols.map(c => (typeof c === 'object' ? c.header || c.dataKey : String(c)));
    const isAoaInput = tableRows.length > 0 && Array.isArray(tableRows[0]);

    const bodyRows = tableRows.map(r => {
      if (isAoaInput) return r;
      return tableCols.map(c => {
        const key = typeof c === 'object' ? c.dataKey || c.key : c;
        const val = r[key];
        return val !== null && val !== undefined ? String(val) : '';
      });
    });

    if (tableSummary && Array.isArray(tableSummary)) {
      bodyRows.push(tableSummary.map(val => (val !== null && val !== undefined ? String(val) : '')));
    }

    // Build column alignments and widths
    const columnStyles = {};
    tableCols.forEach((col, idx) => {
      if (typeof col === 'object') {
        const style = {};
        if (col.align) style.halign = col.align;
        if (col.width) style.cellWidth = col.width;
        columnStyles[idx] = style;
      }
    });

    // AutoTable Execution
    autoTable(doc, {
      startY: currentY,
      head: [headRow],
      body: bodyRows,
      margin: {
        top: geometry.marginMm.top + 4,
        bottom: geometry.marginMm.bottom + 2,
        left: marginLeft,
        right: marginRight,
      },
      headStyles: {
        fillColor: [...DOCUMENT_COLORS.primaryRgb],
        textColor: [...DOCUMENT_COLORS.whiteRgb],
        font: DOCUMENT_FONTS.family,
        fontStyle: DOCUMENT_FONTS.styles.bold,
        fontSize: DOCUMENT_FONTS.sizes.tableHeader,
        halign: 'left',
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      },
      alternateRowStyles: {
        fillColor: [...DOCUMENT_COLORS.rowStripeRgb],
      },
      bodyStyles: {
        font: DOCUMENT_FONTS.family,
        fontSize: DOCUMENT_FONTS.sizes.tableBody,
        textColor: [...DOCUMENT_COLORS.textBodyRgb],
        cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        lineColor: [...DOCUMENT_COLORS.borderSubduedRgb],
        lineWidth: 0.1,
      },
      columnStyles,
      didParseCell: (data) => {
        // Highlight totals row if present
        if (tableSummary && data.section === 'body' && data.row.index === bodyRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249]; // Slate 100
          data.cell.styles.textColor = [...DOCUMENT_COLORS.textDarkRgb];
          data.cell.styles.lineWidth = { top: 0.3, bottom: 0.3, left: 0, right: 0 };
          data.cell.styles.lineColor = [...DOCUMENT_COLORS.borderStrongRgb];
        }
      },
    });

    currentY = (doc.lastAutoTable?.finalY || currentY) + 8;
  }

  // 4. RUNNING DYNAMIC FOOTERS ON ALL PAGES
  const totalPages = doc.internal.getNumberOfPages();
  const showPoweredBy = identity.showPoweredBy !== false;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);

    const footerY = pageHeight - geometry.marginMm.bottom + 4;

    // Divider line above footer
    doc.setDrawColor(...DOCUMENT_COLORS.borderSubduedRgb);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, footerY - 3, pageWidth - marginRight, footerY - 3);

    doc.setFont(DOCUMENT_FONTS.family, DOCUMENT_FONTS.styles.normal);
    doc.setFontSize(DOCUMENT_FONTS.sizes.footer);
    doc.setTextColor(...DOCUMENT_COLORS.textLightRgb);

    // Left: Timestamp
    doc.text(`Generated: ${dateStr}`, marginLeft, footerY);

    // Center: Page X of Y
    doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, footerY, { align: 'center' });

    // Right: Commercial Branding
    if (showPoweredBy) {
      doc.text('Powered by Zana POS', pageWidth - marginRight, footerY, { align: 'right' });
    }
  }

  // 5. OUTPUT OR DOWNLOAD TRIGGER
  if (save && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
      return { success: true, doc };
    } catch (err) {
      console.error('[generatePDF] Browser save failed:', err);
      return { success: false, doc, error: err };
    }
  }

  // In-memory arraybuffer / blob for node testing or custom uploads
  const pdfBuffer = doc.output('arraybuffer');
  let pdfBlob = null;
  if (typeof Blob !== 'undefined') {
    pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
  }

  return {
    success: true,
    doc,
    buffer: pdfBuffer,
    blob: pdfBlob,
    pageCount: totalPages,
  };
}

export default generatePDF;
