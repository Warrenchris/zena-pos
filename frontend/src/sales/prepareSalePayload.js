import { getNextReceiptNumber } from '../offline/offlineNumbering';
import { generateReceiptToken } from '../utils/receiptToken';
import { calculateChange, roundToTwoDecimals } from '../utils/changeCalculation';
import { mapCartItemToSalePayload } from '../utils/cartItems';

/**
 * Generate RFC4122 v4 UUID with fallback if crypto.randomUUID is not supported.
 * @returns {string} UUID string
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Prepares the canonical sale payload for creation and offline queuing across all sale entry points.
 * Ensures receiptNumber, receiptToken, cashierName, tax snapshot, change snapshot, and idempotencyKey
 * are consistently generated and present.
 *
 * @param {Object} params
 * @param {Array} params.items - Raw cart items or formatted items
 * @param {number} params.total - Grand total amount
 * @param {number} [params.subtotal] - Subtotal before discount/tax
 * @param {string} [params.paymentMethod='cash'] - Payment method
 * @param {number|string} [params.paymentAmount] - Amount tendered by customer
 * @param {Object} [params.customer] - Customer object { name, phone, email, location }
 * @param {string|number} [params.customerId] - Customer ID
 * @param {number} [params.discount=0] - Total discount amount
 * @param {string} [params.discountType] - 'percentage' | 'fixed' | null
 * @param {number} [params.discountValue] - Discount value
 * @param {string} [params.discountReason] - Discount reason or coupon note
 * @param {string} [params.couponCode] - Coupon code if applicable
 * @param {string} [params.notes] - Sale notes
 * @param {string} [params.managerApprovalId] - Manager approval ID if applicable
 * @param {string} [params.managerPassword] - Manager password if applicable
 * @param {Array} [params.payments] - Split payment legs if applicable
 * @param {Object} [params.user] - Authenticated user / employee
 * @param {Object} [params.shopSettings] - Shop settings { taxRate, taxInclusive, ... }
 * @param {string} [params.receiptNumber] - Explicit receipt number (e.g. from state/retry)
 * @param {string} [params.receiptToken] - Explicit receipt token (e.g. from state/retry)
 * @param {string} [params.idempotencyKey] - Explicit idempotency key
 * @param {string} [params.cashierName] - Explicit cashier name
 * @param {Function} [params.onFallback] - Fallback callback if IndexedDB is unavailable
 * @returns {Promise<{ salePayload: Object, meta: Object }>}
 */
export async function prepareSalePayload(params = {}) {
  const total = roundToTwoDecimals(params.total || 0);

  // 1. Receipt Number allocation
  const receiptNumber = params.receiptNumber || (await getNextReceiptNumber({
    onFallback: params.onFallback
  }));

  // 2. Receipt Token generation (22-char base64url)
  const receiptToken = params.receiptToken || generateReceiptToken();

  // 3. Cashier name snapshot
  const user = params.user || {};
  const cashierName = params.cashierName ||
    user.name ||
    (user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : null) ||
    user.username ||
    user.email ||
    'Cashier';

  // 4. Idempotency key (random UUID, never derived from receiptNumber)
  const idempotencyKey = params.idempotencyKey || generateUUID();

  // 5. Tax snapshots
  const shopSettings = params.shopSettings || {};
  const taxRate = typeof shopSettings.taxRate === 'number'
    ? shopSettings.taxRate
    : parseFloat(shopSettings.taxRate || 0);
  const taxInclusive = Boolean(shopSettings.taxInclusive);

  let taxAmount = 0;
  if (params.taxAmount !== undefined && params.taxAmount !== null) {
    taxAmount = roundToTwoDecimals(params.taxAmount);
  } else if (params.tax !== undefined && typeof params.tax === 'number') {
    taxAmount = roundToTwoDecimals(params.tax);
  } else {
    const computedTax = taxInclusive
      ? (total * (taxRate / (100 + taxRate)))
      : (total * (taxRate / 100));
    taxAmount = roundToTwoDecimals(computedTax);
  }

  // 6. Payment & Change snapshots
  const paymentMethod = params.paymentMethod || 'cash';
  const rawPaymentAmount = params.paymentAmount !== undefined && params.paymentAmount !== '' && params.paymentAmount !== null
    ? parseFloat(params.paymentAmount)
    : total;
  const paymentAmount = roundToTwoDecimals(rawPaymentAmount);

  // Change only applies to cash payments
  const changeAmount = paymentMethod === 'cash'
    ? calculateChange(paymentAmount, total)
    : 0;

  // 7. Format line items
  const rawItems = Array.isArray(params.items) ? params.items : [];
  const formattedItems = rawItems.map(item => {
    if (item && item.productId && item.price !== undefined) {
      return item;
    }
    return mapCartItemToSalePayload(item);
  });

  // 8. Standardize customer
  const customerObj = {
    name: params.customer?.name || (typeof params.customer === 'string' ? params.customer : ''),
    phone: params.customer?.phone || '',
    email: params.customer?.email || '',
    location: params.customer?.location || ''
  };

  const salePayload = {
    idempotencyKey,
    receiptNumber,
    receiptToken,
    cashierName,
    taxAmount,
    tax: taxAmount,
    taxRate,
    taxInclusive,
    changeAmount,
    change: changeAmount,
    managerApprovalId: params.managerApprovalId || null,
    managerPassword: params.managerPassword || null,
    items: formattedItems,
    totalAmount: total,
    total,
    subtotal: params.subtotal !== undefined ? roundToTwoDecimals(params.subtotal) : undefined,
    discount: params.discount ? roundToTwoDecimals(params.discount) : 0,
    discountType: params.discountType || null,
    discountValue: params.discountValue !== undefined && params.discountValue !== null ? parseFloat(params.discountValue) : null,
    discountReason: params.discountReason || (params.couponCode ? `Coupon: ${params.couponCode}` : null),
    couponCode: params.couponCode || null,
    paymentMethod,
    paymentAmount,
    customer: customerObj,
    customerId: params.customerId || null,
    notes: params.notes || '',
    ...(params.payments ? { payments: params.payments } : {})
  };

  const meta = {
    receiptNumber,
    receiptToken,
    cashierName,
    taxAmount,
    taxRate,
    taxInclusive,
    changeAmount,
    idempotencyKey,
    total,
    paymentMethod,
    paymentAmount
  };

  return { salePayload, meta };
}
