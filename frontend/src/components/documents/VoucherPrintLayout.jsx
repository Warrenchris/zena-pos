import React from 'react';
import PrintableDocumentContainer from './PrintableDocumentContainer';

export function formatDocumentDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  }).format(date);
}

export default function VoucherPrintLayout({
  type,
  document,
  identity,
  formatCurrency,
}) {
  if (!document) return null;

  const isPurchaseOrder = type === 'purchase-order';
  const title = isPurchaseOrder ? 'PURCHASE ORDER' : 'PURCHASE VOUCHER';
  const documentNumber = isPurchaseOrder ? document.poNumber : document.referenceNo;
  const documentDate = isPurchaseOrder
    ? document.orderDate || document.createdAt
    : document.purchaseDate || document.createdAt;
  const items = Array.isArray(document.lineItems) && document.lineItems.length > 0
    ? document.lineItems
    : (Array.isArray(document.items) ? document.items : []);
  const total = Number(document.totalAmount || 0);
  const paid = Number(document.paidAmount || 0);
  const outstanding = Math.max(0, total - paid);

  return (
    <PrintableDocumentContainer
      title={title}
      documentNumber={documentNumber}
      subtitle={isPurchaseOrder ? 'Supplier procurement document' : (document.status === 'RECEIVED' ? 'Goods received record' : 'Purchase record')}
      identity={identity}
      meta={[
        { label: 'Date', value: formatDocumentDate(documentDate) },
        { label: 'Status', value: document.status || '—' },
        ...(isPurchaseOrder
          ? [{ label: 'Expected delivery', value: formatDocumentDate(document.expectedDeliveryDate) }]
          : [
              { label: 'Payment', value: document.paymentStatus || 'UNPAID' },
              { label: 'Payment method', value: document.paymentMethod || 'Not recorded' },
            ]),
      ]}
      className="voucher-print-layout"
    >
      <div className="space-y-7 text-sm">
        <section className="grid grid-cols-2 gap-6 border-b border-slate-200 pb-5">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {isPurchaseOrder ? 'Supplier / Vendor' : 'Supplier'}
            </p>
            <p className="text-base font-semibold text-slate-900">{document.supplierName || '—'}</p>
            {document.supplierContact && (
              <p className="mt-1 text-xs text-slate-600">{document.supplierContact}</p>
            )}
            {document.supplierEmail && (
              <p className="mt-1 text-xs text-slate-600">{document.supplierEmail}</p>
            )}
            {document.supplierPhone && (
              <p className="mt-1 text-xs text-slate-600">{document.supplierPhone}</p>
            )}
          </div>
          <div className="text-right">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {isPurchaseOrder ? 'Delivery details' : 'Receiving details'}
            </p>
            {isPurchaseOrder ? (
              <p className="font-medium text-slate-800">
                {document.expectedDeliveryDate
                  ? `Expected ${formatDocumentDate(document.expectedDeliveryDate)}`
                  : 'Delivery date not specified'}
              </p>
            ) : (
              <p className="font-medium text-slate-800">{formatDocumentDate(documentDate)}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">Document status: {document.status || '—'}</p>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {isPurchaseOrder ? 'Items ordered' : 'Items received / recorded'}
          </h2>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-600">
                <th className="px-2 py-3 font-semibold">Description</th>
                {isPurchaseOrder && <th className="px-2 py-3 text-right font-semibold">Ordered</th>}
                {isPurchaseOrder && <th className="px-2 py-3 text-right font-semibold">Received</th>}
                {!isPurchaseOrder && <th className="px-2 py-3 text-right font-semibold">Quantity</th>}
                <th className="px-2 py-3 text-right font-semibold">Unit cost</th>
                <th className="px-2 py-3 text-right font-semibold">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const quantity = Number(isPurchaseOrder ? item.quantityOrdered : item.quantity || 0);
                const lineTotal = Number(
                  isPurchaseOrder
                    ? item.subtotal ?? quantity * Number(item.unitCost || 0)
                    : item.totalCost ?? quantity * Number(item.unitCost || 0)
                );
                return (
                  <tr key={item.id || item.productId || item.sku || index} className="border-b border-slate-200">
                    <td className="px-2 py-3 font-medium text-slate-800">
                      {item.productName || 'Unnamed item'}
                      {item.sku && <span className="mt-0.5 block text-[10px] font-normal text-slate-500">SKU: {item.sku}</span>}
                    </td>
                    {isPurchaseOrder && (
                      <td className="px-2 py-3 text-right tabular-nums text-slate-700">{quantity.toLocaleString('en-KE')}</td>
                    )}
                    {isPurchaseOrder && (
                      <td className="px-2 py-3 text-right tabular-nums text-slate-700">{Number(item.quantityReceived || 0).toLocaleString('en-KE')}</td>
                    )}
                    {!isPurchaseOrder && (
                      <td className="px-2 py-3 text-right tabular-nums text-slate-700">{quantity.toLocaleString('en-KE')}</td>
                    )}
                    <td className="px-2 py-3 text-right tabular-nums text-slate-700">{formatCurrency(Number(item.unitCost || 0))}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && (
            <p className="border-b border-slate-200 py-6 text-center text-xs text-slate-500">No line items are available for this document.</p>
          )}
        </section>

        <section className="ml-auto w-full max-w-sm space-y-2 border-t border-slate-300 pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              {isPurchaseOrder ? 'Purchase order total' : 'Purchase total'}
            </span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{formatCurrency(total)}</span>
          </div>
          {!isPurchaseOrder && (
            <>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Paid to supplier</span>
                <span className="font-medium tabular-nums">{formatCurrency(paid)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Outstanding</span>
                <span className="font-semibold tabular-nums">{formatCurrency(outstanding)}</span>
              </div>
              <p className="border-t border-slate-200 pt-2 text-[10px] leading-relaxed text-slate-500">
                Goods receipt and supplier payment are recorded separately. This voucher is not proof of payment.
              </p>
            </>
          )}
        </section>

        {document.notes && (
          <section className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {isPurchaseOrder ? 'Order notes and terms' : 'Notes'}
            </p>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{document.notes}</p>
          </section>
        )}

        <section className="grid grid-cols-2 gap-10 pt-8">
          <div>
            <div className="h-10 border-b border-slate-400" />
            <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {isPurchaseOrder ? 'Authorized purchasing officer' : 'Authorized by'}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">Name, signature and date</p>
          </div>
          <div>
            <div className="h-10 border-b border-slate-400" />
            <p className="mt-2 text-right text-[10px] font-medium uppercase tracking-wide text-slate-600">
              {isPurchaseOrder ? 'Supplier acceptance' : 'Storekeeper / receiver'}
            </p>
            <p className="mt-1 text-right text-[10px] text-slate-400">Name, signature and date</p>
          </div>
        </section>
      </div>
    </PrintableDocumentContainer>
  );
}
