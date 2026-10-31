/**
 * Money coercion and arithmetic safety helpers for API DECIMAL boundary.
 *
 * Background:
 * Databases (MySQL / PostgreSQL) return DECIMAL columns (e.g. total, price, subtotal, tax)
 * as strings over JSON (e.g. "50.00") to avoid IEEE-754 precision loss in database drivers.
 * In JavaScript, calling .toFixed(2) directly on a string throws:
 *   TypeError: value.toFixed is not a function
 * Furthermore, string addition ("50.00" + "10.00") results in concatenation ("50.0010.00").
 *
 * This utility provides safe Number coercion at the API boundary while preserving
 * non-plain objects (Blob, ArrayBuffer, FormData, Date), null/undefined, and non-numeric values.
 */

/**
 * Check if a value is a plain JavaScript object (i.e. created with {} or Object.create(null)).
 * Returns false for null, primitives, Arrays, and non-plain object instances
 * like Blob, ArrayBuffer, FormData, Date, RegExp, Map, Set, TypedArray, etc.
 *
 * @param {any} val - The value to check
 * @returns {boolean} True if plain object, false otherwise
 */
export const isPlainObject = (val) => {
  if (val === null || typeof val !== 'object') return false;

  // Explicitly guard against known browser and Node non-plain objects
  if (
    val instanceof Date ||
    val instanceof RegExp ||
    (typeof Blob !== 'undefined' && val instanceof Blob) ||
    (typeof ArrayBuffer !== 'undefined' && (val instanceof ArrayBuffer || ArrayBuffer.isView(val))) ||
    (typeof FormData !== 'undefined' && val instanceof FormData)
  ) {
    return false;
  }

  // Fast check: prototype must be Object.prototype or null
  const proto = Object.getPrototypeOf(val);
  if (proto === null) return true;
  return proto === Object.prototype;
};

/**
 * Safely coerce any value (especially "50.00"-style strings from API DECIMAL columns)
 * to a finite JavaScript Number.
 *
 * @param {any} value - The input value to coerce
 * @param {number} [fallback=0] - The value to return if conversion results in NaN or is null/undefined/empty
 * @returns {number} The coerced number, guaranteed to support .toFixed() and work with arithmetic
 */
export const coerceMoney = (value, fallback = 0) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return fallback;

    // Fast path for clean numeric strings (e.g. "50.00", "-15.25", "0.00")
    const num = Number(trimmed);
    if (Number.isFinite(num)) {
      return num;
    }

    // Coerce formatted strings (e.g. "1,250.50", "$50.00", "KSh 50.00")
    const cleaned = trimmed.replace(/,/g, '').replace(/^[^\d.-]+/, '').trim();
    if (cleaned === '' || cleaned === '-' || cleaned === '.') {
      return fallback;
    }
    const cleanedNum = Number(cleaned);
    return Number.isFinite(cleanedNum) ? cleanedNum : fallback;
  }
  return fallback;
};

/**
 * Common money and decimal field names returned by backend models and API endpoints.
 */
export const MONEY_FIELD_NAMES = new Set([
  'total',
  'subtotal',
  'tax',
  'taxAmount',
  'taxRate',
  'discount',
  'discountValue',
  'discountAmount',
  'price',
  'unitPrice',
  'originalPrice',
  'costPrice',
  'cost',
  'lineTotal',
  'paymentAmount',
  'change',
  'changeAmount',
  'amount',
  'totalAmount',
  'refundAmount',
  'balance',
  'creditLimit',
  'currentBalance',
  'totalSpent',
  'minimumOrderAmount',
  'tendered',
  'gross_profit_margin',
  'net_profit_margin',
  'current_ratio',
  'inventory_turnover',
  'quick_ratio',
  'debt_to_equity',
  'operating_expense_ratio',
  'return_on_assets',
  'cash_conversion_cycle'
]);

/**
 * Recursively traverse and coerce known money/decimal fields in an API response
 * from decimal strings (e.g. "50.00") to JavaScript numbers.
 *
 * Rules:
 * 1. Skips non-plain objects (Blob, ArrayBuffer, FormData, Date, etc.) and leaves them untouched.
 * 2. Preserves null and undefined exactly as-is.
 * 3. Only coerces string values in money fields that parse as finite numbers (e.g. "50.00" -> 50).
 *    All other values (already numbers, non-numeric strings, booleans, null/undefined) are left as-is.
 *
 * @param {any} data - The response payload (object, array, primitive, blob, etc.)
 * @param {Set<string>} [moneyFields=MONEY_FIELD_NAMES] - Field names to coerce
 * @returns {any} A clone of data with decimal fields coerced, or data untouched if non-plain/primitive
 */
export const coerceMoneyFields = (data, moneyFields = MONEY_FIELD_NAMES) => {
  // Preserve null and undefined exactly as-is
  if (data === null || data === undefined) return data;

  // Primitives (number, string, boolean, symbol, bigint) are left untouched
  if (typeof data !== 'object') return data;

  // Skip non-plain objects (Blob, ArrayBuffer, FormData, Date, etc.)
  if (!Array.isArray(data) && !isPlainObject(data)) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => coerceMoneyFields(item, moneyFields));
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    // 1. Preserve null and undefined exactly as-is
    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    // 2. For money fields: only coerce strings that parse as finite numbers
    if (moneyFields.has(key)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '') {
          // Clean numeric check
          const num = Number(trimmed);
          if (Number.isFinite(num)) {
            result[key] = num;
            continue;
          }
          // Check formatted currency strings (e.g. "1,250.50", "$50.00", "KSh 50.00")
          const cleaned = trimmed.replace(/,/g, '').replace(/^[^\d.-]+/, '').trim();
          if (cleaned !== '' && cleaned !== '-' && cleaned !== '.') {
            const cleanedNum = Number(cleaned);
            if (Number.isFinite(cleanedNum)) {
              result[key] = cleanedNum;
              continue;
            }
          }
        }
        // Non-numeric or empty string: leave as-is
        result[key] = value;
      } else {
        // Already a number or non-string: leave as-is
        result[key] = value;
      }
      continue;
    }

    // 3. Recursive traversal for arrays and plain objects
    if (Array.isArray(value)) {
      result[key] = coerceMoneyFields(value, moneyFields);
    } else if (isPlainObject(value)) {
      result[key] = coerceMoneyFields(value, moneyFields);
    } else {
      // Non-plain objects (e.g. Date inside an object) or other values: leave as-is
      result[key] = value;
    }
  }

  return result;
};

export default coerceMoney;
