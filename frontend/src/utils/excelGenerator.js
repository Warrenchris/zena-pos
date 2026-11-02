/**
 * Zana POS — Unified Document Design System (UDDS)
 * Authoritative Shared Excel (.xlsx) Generation Utility
 *
 * Built on verified capabilities of SheetJS Community Edition (xlsx 0.18.5):
 * - Semantic cell types (t: 'n', t: 's', t: 'd')
 * - Number and currency formatting strings (z: '"KSh" #,##0.00')
 * - Dynamic column widths (!cols) calculated from content length
 * - Freeze panes (!views) for sticky header scrolling
 * - Business metadata header blocks
 * - Multi-sheet workbook support
 * - Safe browser download and Node testing compatibility
 */

import { DOCUMENT_FORMATS } from './documentTokens';

/**
 * Dynamically resolves the xlsx module across both Vite ESM and Jest CommonJS environments.
 */
async function getXlsxModule() {
  const mod = await import('xlsx');
  return mod.default || mod;
}

/**
 * Calculates auto-fit column widths based on maximum string lengths in the sheet.
 *
 * @param {Array<Array<*>>} aoaData - 2D array of all rows in the sheet
 * @param {Array<Object>} [columnDefs] - Optional column configurations with manual widths
 * @returns {Array<{wch: number}>} Array of column width definitions for ws['!cols']
 */
export function calculateColumnWidths(aoaData, columnDefs = []) {
  if (!Array.isArray(aoaData) || aoaData.length === 0) {
    return [];
  }

  const colCount = Math.max(...aoaData.map(r => (Array.isArray(r) ? r.length : 0)));
  const widths = new Array(colCount).fill(12);

  for (let r = 0; r < aoaData.length; r++) {
    const row = aoaData[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const val = row[c];
      if (val !== null && val !== undefined) {
        const strLen = String(val).length;
        if (strLen + 3 > widths[c]) {
          widths[c] = strLen + 3;
        }
      }
    }
  }

  // Apply explicit manual width overrides if provided
  return widths.map((w, idx) => {
    const manualWidth = columnDefs[idx]?.width;
    const clampedWidth = Math.max(12, Math.min(60, manualWidth || w));
    return { wch: clampedWidth };
  });
}

/**
 * Builds a formatted worksheet from structured configuration.
 *
 * @param {Object} xlsx - The loaded SheetJS library
 * @param {Object} options - Sheet configuration
 * @returns {{ ws: Object, headerRowCount: number }}
 */
export function buildWorksheet(xlsx, options = {}) {
  const {
    identity = {},
    title = 'REPORT',
    subtitle = null,
    meta = [],
    columns = [],
    rows = [],
    summaryRow = null,
  } = options;

  const aoa = [];
  const currencySymbol = identity.currencySymbol || DOCUMENT_FORMATS.defaultCurrencySymbol;

  // 1. Business Header Block
  const businessName = identity.displayName || identity.organizationName || 'Zana POS';
  aoa.push([businessName]);
  aoa.push([String(title).toUpperCase()]);

  if (subtitle) {
    aoa.push([String(subtitle)]);
  }

  // Business details line (Address, Phone, Tax PIN)
  const contactParts = [];
  if (identity.address) contactParts.push(identity.address);
  if (identity.phone) contactParts.push(`Tel: ${identity.phone}`);
  if (identity.kraPin) contactParts.push(`PIN: ${identity.kraPin}`);
  if (contactParts.length > 0) {
    aoa.push([contactParts.join(' | ')]);
  }

  // Metadata items (Generated Date, Operator, Period)
  const metaParts = [];
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
  metaParts.push(`Generated: ${nowStr}`);
  if (identity.printedBy) {
    metaParts.push(`By: ${identity.printedBy}`);
  }
  if (Array.isArray(meta)) {
    meta.forEach(m => {
      if (m && m.label && m.value !== undefined) {
        metaParts.push(`${m.label}: ${m.value}`);
      }
    });
  }
  aoa.push([metaParts.join(' | ')]);

  // Empty separator row before table
  aoa.push([]);

  // 2. Table Column Headers
  const tableHeaderRowIndex = aoa.length; // 0-indexed row for freeze panes
  const headers = columns.map(c => (typeof c === 'object' ? c.header || c.key : String(c)));
  aoa.push(headers);

  // 3. Data Rows
  const dataStartRowIndex = aoa.length;
  const isAoaInput = rows.length > 0 && Array.isArray(rows[0]);

  for (let r = 0; r < rows.length; r++) {
    const rowItem = rows[r];
    if (isAoaInput) {
      aoa.push([...rowItem]);
    } else {
      const rowValues = columns.map(c => {
        const key = typeof c === 'object' ? c.key : c;
        return rowItem[key] !== undefined ? rowItem[key] : '';
      });
      aoa.push(rowValues);
    }
  }

  // 4. Summary Row (if provided)
  let summaryRowIndex = -1;
  if (summaryRow && Array.isArray(summaryRow)) {
    summaryRowIndex = aoa.length;
    aoa.push(summaryRow);
  }

  // Create sheet from AOA
  const ws = xlsx.utils.aoa_to_sheet(aoa);

  // 5. Apply Semantic Cell Types and Number Formatting (SheetJS CE)
  for (let c = 0; c < columns.length; c++) {
    const colDef = typeof columns[c] === 'object' ? columns[c] : { key: columns[c] };
    const colType = colDef.type || 'string';

    const formatString =
      colType === 'currency'
        ? `"${currencySymbol}" ${DOCUMENT_FORMATS.currencyNumberFormat}`
        : colType === 'number'
        ? DOCUMENT_FORMATS.currencyNumberFormat
        : colType === 'integer' || colType === 'quantity'
        ? DOCUMENT_FORMATS.quantityNumberFormat
        : colType === 'percent'
        ? DOCUMENT_FORMATS.percentFormat
        : null;

    if (formatString || colType === 'number' || colType === 'currency') {
      const colLetter = xlsx.utils.encode_col(c);

      // Data rows
      for (let r = dataStartRowIndex; r < dataStartRowIndex + rows.length; r++) {
        const cellRef = `${colLetter}${r + 1}`; // 1-indexed for Excel
        const cell = ws[cellRef];
        if (cell && cell.v !== undefined && cell.v !== '') {
          const num = typeof cell.v === 'number' ? cell.v : parseFloat(cell.v);
          if (Number.isFinite(num)) {
            cell.t = 'n';
            cell.v = num;
            if (formatString) {
              cell.z = formatString;
            }
          }
        }
      }

      // Summary row
      if (summaryRowIndex >= 0) {
        const cellRef = `${colLetter}${summaryRowIndex + 1}`;
        const cell = ws[cellRef];
        if (cell && cell.v !== undefined && cell.v !== '') {
          const num = typeof cell.v === 'number' ? cell.v : parseFloat(cell.v);
          if (Number.isFinite(num)) {
            cell.t = 'n';
            cell.v = num;
            if (formatString) {
              cell.z = formatString;
            }
          }
        }
      }
    }
  }

  // 6. Column Auto-Widths (!cols)
  ws['!cols'] = calculateColumnWidths(aoa, columns);

  // 7. Freeze Panes (!views)
  // Freeze so business headers + column headers remain visible
  ws['!views'] = [{ state: 'frozen', ySplit: tableHeaderRowIndex + 1 }];

  return { ws, headerRowCount: tableHeaderRowIndex + 1 };
}

/**
 * Generates and downloads a complete Excel (.xlsx) workbook.
 *
 * @param {Object} options - Export configuration
 * @param {string} [options.fileName='export.xlsx'] - Download filename
 * @param {string} [options.sheetName='Report'] - Main worksheet name
 * @param {Object} [options.identity] - Business identity from resolveBusinessIdentity
 * @param {string} [options.title='REPORT'] - Document title
 * @param {string} [options.subtitle] - Subtitle / period
 * @param {Array} [options.meta] - Metadata key-value pairs
 * @param {Array<Object>} [options.columns] - Column definitions [{ key, header, type, width }]
 * @param {Array} [options.rows] - Row data (array of objects or array of arrays)
 * @param {Array} [options.summaryRow] - Optional totals row
 * @param {Array<Object>} [options.sheets] - Optional multi-sheet definition
 * @param {boolean} [options.save=true] - Trigger browser download
 * @returns {Promise<{ success: boolean, workbook: Object, buffer?: ArrayBuffer, blob?: Blob }>}
 */
export async function generateExcel(options = {}) {
  const {
    fileName = 'export.xlsx',
    sheetName = 'Report',
    sheets = null,
    save = true,
  } = options;

  const xlsx = await getXlsxModule();
  const wb = xlsx.utils.book_new();

  if (Array.isArray(sheets) && sheets.length > 0) {
    // Multi-sheet workbook
    sheets.forEach((sheetConfig, idx) => {
      const name = sheetConfig.sheetName || `Sheet ${idx + 1}`;
      const { ws } = buildWorksheet(xlsx, sheetConfig);
      xlsx.utils.book_append_sheet(wb, ws, name.substring(0, 31)); // Excel limit: 31 chars
    });
  } else {
    // Single sheet workbook
    const { ws } = buildWorksheet(xlsx, options);
    xlsx.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
  }

  // Output as array buffer
  const excelBuffer = xlsx.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  });

  // Browser download trigger
  if (save && typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          // Cleanup
        }
      }, 2000);

      return { success: true, workbook: wb, blob };
    } catch (err) {
      console.error('[generateExcel] Browser download failed:', err);
      return { success: false, workbook: wb, error: err };
    }
  }

  return { success: true, workbook: wb, buffer: excelBuffer };
}

export default generateExcel;
