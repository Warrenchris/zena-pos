/**
 * Zana POS — Unified Document Design System (UDDS)
 * Enhanced CSV Generator & Downloader
 *
 * Implements RFC 4180 compliant CSV formatting with:
 * - UTF-8 Byte Order Mark (\uFEFF) to guarantee clean Excel opening across Windows/Mac
 * - Proper escaping of quotes (""), commas, newlines, and carriage returns
 * - Formula injection prevention for untrusted text
 * - Support for both Array-of-Objects and Array-of-Arrays (AOA)
 * - Safe asynchronous ObjectURL cleanup
 * - 100% backward compatibility with existing consumers
 */

/**
 * Escapes an individual CSV cell according to RFC 4180 standards.
 *
 * @param {*} value - Cell value
 * @param {Object} [options]
 * @param {boolean} [options.preventInjection=true] - Neutralize formula injection
 * @param {string} [options.delimiter=','] - Field separator
 * @returns {string} Escaped cell string
 */
export function escapeCSVField(value, options = {}) {
  const { preventInjection = true, delimiter = ',' } = options;

  if (value === null || value === undefined) {
    return '';
  }

  // Handle Date objects cleanly and predictably
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }

  // Handle non-finite numbers (NaN, Infinity, -Infinity)
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return '';
  }

  let str = String(value);

  // Prevent spreadsheet formula injection if untrusted text starts with formula triggers
  // CRITICAL: Legitimate numeric values (positive or negative, e.g. -150.50, +42) must remain numeric
  // and must NOT be converted to text with a leading quote.
  if (preventInjection && str.length > 0) {
    const firstChar = str.charAt(0);
    const isFormulaTrigger =
      firstChar === '=' ||
      firstChar === '@' ||
      firstChar === '\t' ||
      firstChar === '\r' ||
      firstChar === '|';

    const isPlusOrMinus = firstChar === '+' || firstChar === '-';

    if (isFormulaTrigger) {
      // Prepend a single quote to force spreadsheet programs to treat as text
      str = `'${str}`;
    } else if (isPlusOrMinus) {
      // Legitimate numeric literal check: matches integers, decimals, scientific notation
      const isLegitimateNumber =
        (typeof value === 'number' && Number.isFinite(value)) ||
        /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(str.trim());

      if (!isLegitimateNumber) {
        str = `'${str}`;
      }
    }
  }

  // Check if quoting is required per RFC 4180
  const mustQuote =
    str.includes(delimiter) ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r') ||
    str.startsWith(' ') ||
    str.endsWith(' ');

  if (mustQuote) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts array-of-objects or array-of-arrays into an RFC 4180 compliant CSV string.
 *
 * @param {Array<Object>|Array<Array<*>>} data - Tabular data
 * @param {Object} [options]
 * @param {Array<string>|Array<{key: string, header: string}>} [options.columns] - Column keys/headers to extract
 * @param {Array<string>} [options.headers] - Custom header row labels
 * @param {boolean} [options.includeBom=true] - Prepend UTF-8 BOM (\uFEFF)
 * @param {boolean} [options.preventInjection=true] - Neutralize formula triggers
 * @param {string} [options.delimiter=','] - Field separator
 * @returns {string} Formatted CSV text
 */
export function generateCSVText(data, options = {}) {
  const {
    columns = null,
    headers = null,
    includeBom = true,
    preventInjection = true,
    delimiter = ',',
  } = options;

  if (!Array.isArray(data) || data.length === 0) {
    return includeBom ? '\uFEFF' : '';
  }

  const escapeOptions = { preventInjection, delimiter };
  const lines = [];

  const firstItem = data[0];
  const isAoa = Array.isArray(firstItem);

  if (isAoa) {
    // Array of arrays format
    if (headers && Array.isArray(headers)) {
      lines.push(headers.map(h => escapeCSVField(h, escapeOptions)).join(delimiter));
    }
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row)) {
        lines.push(row.map(cell => escapeCSVField(cell, escapeOptions)).join(delimiter));
      }
    }
  } else {
    // Array of objects format
    let keys = [];
    let headerLabels = [];

    if (columns && Array.isArray(columns) && columns.length > 0) {
      if (typeof columns[0] === 'object' && columns[0] !== null) {
        keys = columns.map(c => c.key);
        headerLabels = columns.map(c => c.header || c.key);
      } else {
        keys = columns.map(String);
        headerLabels = headers || keys;
      }
    } else {
      keys = Object.keys(firstItem);
      headerLabels = headers || keys;
    }

    // Add header line
    lines.push(headerLabels.map(h => escapeCSVField(h, escapeOptions)).join(delimiter));

    // Add data lines
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (row && typeof row === 'object') {
        const rowValues = keys.map(k => escapeCSVField(row[k], escapeOptions));
        lines.push(rowValues.join(delimiter));
      }
    }
  }

  const csvContent = lines.join('\r\n');
  return includeBom ? `\uFEFF${csvContent}` : csvContent;
}

/**
 * Downloads tabular data as an RFC 4180 CSV file in the browser.
 * 100% backward-compatible with legacy `downloadCSV(filename, rows)`.
 *
 * @param {string} filename - Desired download file name (e.g. 'sales-forecast.csv')
 * @param {Array<Object>|Array<Array<*>>} rowsOrData - Data rows
 * @param {Object} [options] - Optional formatting and column configuration
 * @returns {{ success: boolean, rowCount: number, csv?: string }}
 */
export function downloadCSV(filename, rowsOrData, options = {}) {
  if (!rowsOrData || rowsOrData.length === 0) {
    return { success: false, rowCount: 0 };
  }

  const csvText = generateCSVText(rowsOrData, options);

  // Safe browser download handling
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', filename || 'export.csv');
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Asynchronous revocation prevents early cancellation in Firefox/Safari
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          // Non-blocking cleanup
        }
      }, 2000);

      return { success: true, rowCount: rowsOrData.length };
    } catch (err) {
      console.error('[downloadCSV] Browser download failed:', err);
      return { success: false, rowCount: rowsOrData.length, error: err };
    }
  }

  // Non-browser / Node testing environment
  return { success: true, rowCount: rowsOrData.length, csv: csvText };
}

export default downloadCSV;
