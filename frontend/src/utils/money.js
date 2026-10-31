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
 * This utility provides safe Number coercion at the API boundary.
 */

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
 * from "50.00"-style strings to numbers.
 *
 * @param {any} data - The response payload (object, array, primitive)
 * @param {Set<string>} [moneyFields=MONEY_FIELD_NAMES] - Field names to coerce
 * @returns {any} A clone of data with decimal fields coerced to numbers
 */
export const coerceMoneyFields = (data, moneyFields = MONEY_FIELD_NAMES) => {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  // Preserve non-plain objects (Date, RegExp, Blob, FormData, etc.)
  if (
    data instanceof Date ||
    data instanceof RegExp ||
    (typeof Blob !== 'undefined' && data instanceof Blob) ||
    (typeof FormData !== 'undefined' && data instanceof FormData)
  ) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => coerceMoneyFields(item, moneyFields));
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (moneyFields.has(key) && (typeof value === 'string' || typeof value === 'number')) {
      result[key] = coerceMoney(value);
    } else if (value && typeof value === 'object') {
      result[key] = coerceMoneyFields(value, moneyFields);
    } else {
      result[key] = value;
    }
  }
  return result;
};

export default coerceMoney;
