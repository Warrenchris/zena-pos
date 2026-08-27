import React from 'react';
import {
  CheckCircleIcon,
  PrinterIcon,
  EnvelopeIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';
import Button from './ui/Button';

/**
 * SaleCompleteModal — Post-payment receipt/confirmation screen.
 * Displays after a successful sale; does NOT auto-dismiss.
 * The cashier must explicitly click "New Sale" to return to idle.
 *
 * Props:
 *   completedSale  – { serverData, items, customer, total, paymentMethod, paymentAmount, change, notes }
 *   onNewSale      – () => void  (resets to idle)
 *   onClose        – () => void  (same as onNewSale, for backdrop click)
 */
export default function SaleCompleteModal({ completedSale, onNewSale, onClose }) {
  const { format: formatCurrency } = useCurrency();

  if (!completedSale) return null;

  const {
    serverData,
    items = [],
    customer,
    total = 0,
    paymentMethod = 'cash',
    paymentAmount = 0,
    change = 0,
    notes
  } = completedSale;

  const invoiceNumber = serverData?.invoiceNumber || serverData?.id || 'N/A';
  const isCash = paymentMethod === 'cash';
  const isSplit = paymentMethod === 'split';
  const customerEmail = customer?.email;

  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleEmailReceipt = () => {
    if (window.showToast) {
      window.showToast({
        type: 'info',
        title: 'Email Receipt',
        message: `Receipt will be sent to ${customerEmail}`,
        duration: 3000
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border-default rounded-3xl shadow-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Success Header */}
        <div className="text-center space-y-2 pb-3 border-b border-border-default">
          <div className="mx-auto w-14 h-14 rounded-full bg-success/15 flex items-center justify-center">
            <CheckCircleIcon className="h-8 w-8 text-success" />
          </div>
          <h3 className="text-h2 font-bold text-text-primary">Sale Complete!</h3>
          <p className="text-caption text-text-muted">
            Invoice <span className="font-mono font-bold text-text-primary">#{invoiceNumber}</span>
          </p>
        </div>

        {/* Customer & Payment Summary */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2/40 border border-border-default rounded-2xl">
          <div>
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">Customer</span>
            <p className="text-small font-bold text-text-primary truncate">{customer?.name || 'Walk-in Customer'}</p>
          </div>
          <div className="text-right">
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">Payment</span>
            <p className="text-small font-bold text-text-primary capitalize">
              {isSplit ? 'Split Tender' : paymentMethod}
            </p>
          </div>
        </div>

        {/* Itemized List */}
        <div>
          <h4 className="text-caption font-semibold text-text-muted uppercase tracking-wider mb-2">
            Items ({items.length})
          </h4>
          <div className="border border-border-default rounded-xl overflow-hidden bg-surface-0">
            <div className="max-h-48 overflow-y-auto divide-y divide-border-default">
              {items.map((item, index) => (
                <div key={item.id || index} className="flex items-center justify-between px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-small font-semibold text-text-primary truncate">{item.name}</p>
                    <p className="text-caption text-text-muted">
                      {item.quantity} × {formatCurrency(parseFloat(item.price || 0))}
                    </p>
                  </div>
                  <span className="text-small font-bold text-text-primary ml-3">
                    {formatCurrency(parseFloat(item.price || 0) * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="p-3 bg-surface-2/50 border border-border-default rounded-xl space-y-1.5">
          <div className="flex justify-between text-caption text-text-secondary">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {subtotal !== total && (
            <div className="flex justify-between text-caption text-success font-semibold">
              <span>Discount</span>
              <span>-{formatCurrency(subtotal - total)}</span>
            </div>
          )}
          <div className="h-px bg-border-default"></div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-body font-bold text-text-primary">Total</span>
            <span className="text-h2 font-extrabold text-primary">{formatCurrency(total)}</span>
          </div>
          {isCash && (
            <>
              <div className="flex justify-between text-caption text-text-secondary">
                <span>Amount Received</span>
                <span>{formatCurrency(parseFloat(paymentAmount || 0))}</span>
              </div>
              {change > 0 && (
                <div className="flex justify-between text-small font-bold text-success">
                  <span>Change Due</span>
                  <span>{formatCurrency(change)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border-default">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              leftIcon={PrinterIcon}
              className="flex-1"
              onClick={handlePrint}
            >
              Print Receipt
            </Button>
            {customerEmail && (
              <Button
                type="button"
                variant="outline"
                size="md"
                leftIcon={EnvelopeIcon}
                className="flex-1"
                onClick={handleEmailReceipt}
              >
                Email Receipt
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="primary"
            size="lg"
            fullWidth
            leftIcon={PlusIcon}
            onClick={onNewSale}
            className="py-3 font-bold rounded-xl shadow-md"
          >
            New Sale
          </Button>
        </div>
      </div>
    </div>
  );
}
