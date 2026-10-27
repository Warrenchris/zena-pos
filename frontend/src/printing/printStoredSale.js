import { printReceipt } from './printService';
import { loadProfile } from './profile';
import { getServerInvoiceNumber } from '../offline/syncMappings';

/**
 * Normalizes a stored sale object from API/DB into the format expected by buildReceipt(),
 * and prints it with `isDuplicate = true`.
 *
 * @param {object} sale - Stored sale object
 * @param {object} [options]
 * @param {object} [options.business] - Business details (name, address, phone, kraPin)
 * @param {object} [options.receiptSettings] - Receipt styling settings
 * @param {object} [options.profile] - Printer profile override
 * @param {object} [options.adapters] - Adapter registry override (for testing)
 * @param {function} [options.formatMoney] - Currency formatting function
 * @param {function} [options.showToast] - Toast notification callback: ({ type, title, message, duration }) => void
 * @param {boolean} [options.isDuplicate=true] - Whether to mark as duplicate copy
 * @returns {Promise<{ ok: boolean, adapterId: string|null, fellBack: boolean, error?: string }>}
 */
export async function printStoredSale(sale, options = {}) {
  if (!sale) {
    const err = 'No sale data provided for printing';
    if (typeof options.showToast === 'function') {
      options.showToast({ type: 'error', title: 'Print Failed', message: err });
    } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast({ type: 'error', title: 'Print Failed', message: err });
    }
    return { ok: false, adapterId: null, fellBack: false, error: err };
  }

  const rawItems = Array.isArray(sale.SaleItems) && sale.SaleItems.length > 0
    ? sale.SaleItems
    : Array.isArray(sale.items) && sale.items.length > 0
      ? sale.items
      : Array.isArray(sale.products) ? sale.products : [];

  const items = rawItems.map((item) => ({
    name: item.productName || item.Product?.name || item.name || 'Item',
    price: item.price ?? item.unitPrice ?? item.priceAtSale ?? 0,
    quantity: item.quantity ?? 1,
  }));

  const customerName =
    sale.Customer?.name || sale.customer?.name || sale.customerName || 'Walk-in Customer';

    const rawReceipt = sale.receiptNumber || sale.serverData?.receiptNumber || null;
  let serverInvoiceNumber = sale.invoiceNumber || sale.serverData?.invoiceNumber || null;

  if ((!serverInvoiceNumber || serverInvoiceNumber === 'Pending') && rawReceipt) {
    const mapped = await getServerInvoiceNumber(rawReceipt);
    if (mapped) {
      serverInvoiceNumber = mapped;
    }
  }

  // Derive pendingSync: invoiceNumber is null and no sync mapping found
  const isPending = !serverInvoiceNumber || serverInvoiceNumber === 'Pending';
  const pendingSync = Boolean(sale.isOffline && isPending);

  // Fallback for legacy sales missing receiptNumber: use invoiceNumber or id
  const effectiveReceiptNumber = rawReceipt || (serverInvoiceNumber && serverInvoiceNumber !== 'Pending' ? serverInvoiceNumber : String(sale.id || 'N/A'));

  // Prefer snapshotted values from stored sale over recomputations
  const cashierName = sale.cashierName ?? sale.serverData?.cashierName ?? sale.User?.name ?? sale.Employee?.firstName ?? null;
  const taxAmount = sale.taxAmount ?? sale.serverData?.taxAmount ?? sale.tax ?? sale.serverData?.tax ?? 0;
  const taxRate = sale.taxRate ?? sale.serverData?.taxRate ?? 0;
  const taxInclusive = sale.taxInclusive ?? sale.serverData?.taxInclusive ?? false;
  const paymentAmount = sale.paymentAmount ?? sale.serverData?.paymentAmount ?? sale.paidAmount ?? (sale.totalAmount ?? sale.total ?? 0);
  const change = sale.changeAmount ?? sale.serverData?.changeAmount ?? sale.change ?? sale.serverData?.change ?? 0;
  const receiptToken = sale.receiptToken ?? sale.serverData?.receiptToken ?? null;

  const completedSale = {
    serverData: {
      id: sale.id,
      invoiceNumber: isPending ? (sale.isOffline ? null : 'Pending') : serverInvoiceNumber,
      receiptNumber: effectiveReceiptNumber,
      receiptToken,
      createdAt: sale.createdAt,
      cashierName,
      taxAmount,
      taxRate,
      taxInclusive,
      changeAmount: change,
    },
    receiptNumber: effectiveReceiptNumber,
    receiptToken,
    invoiceNumber: isPending ? null : serverInvoiceNumber,
    pendingSync,
    cashierName,
    taxAmount,
    taxRate,
    taxInclusive,
    tax: {
      amount: taxAmount,
      rate: taxRate,
      inclusive: taxInclusive,
    },
    items,
    customer: { name: customerName },
    total: sale.totalAmount ?? sale.total ?? 0,
    paymentMethod: sale.paymentMethod || 'cash',
    paymentAmount,
    change,
    notes: sale.notes || '',
    isOffline: pendingSync,
    isDuplicate: options.isDuplicate !== undefined ? options.isDuplicate : true,
  };

  const result = await printReceipt(completedSale, {
    formatMoney: options.formatMoney,
    business: options.business,
    receiptSettings: options.receiptSettings,
    profile: options.profile || loadProfile(),
    adapters: options.adapters,
  });

  if (!result.ok) {
    const msg = result.error || 'Check printer connection and try again.';
    if (typeof options.showToast === 'function') {
      options.showToast({ type: 'error', title: 'Could not print receipt', message: msg, duration: 5000 });
    } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast({ type: 'error', title: 'Could not print receipt', message: msg, duration: 5000 });
    }
  } else if (result.fellBack) {
    const warningMsg = 'Your printer could not be reached, so the system print dialog was used.';
    if (typeof options.showToast === 'function') {
      options.showToast({ type: 'warning', title: 'Printed with browser printing', message: warningMsg, duration: 5000 });
    } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast({ type: 'warning', title: 'Printed with browser printing', message: warningMsg, duration: 5000 });
    }
  }

  return result;
}
