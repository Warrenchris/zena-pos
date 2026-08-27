import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  TagIcon,
  LockClosedIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import useCurrency from '../../hooks/useCurrency';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { employeesAPI } from '../../services/api';

const COMMON_REASONS = [
  'Customer Courtesy',
  'Damaged / Scratched Item',
  'Store Promotion',
  'Price Match',
  'Staff / Family',
  'Manager Discretion'
];

/**
 * DiscountModal
 * Supports % or Fixed Amount discount for a line-item or whole cart.
 * Option B: Any cashier can open. Disounts > 10% or > $50 / 500 KSh require manager PIN approval.
 */
export default function DiscountModal({
  isOpen,
  onClose,
  target, // 'item' | 'cart'
  item = null, // item object if target === 'item'
  baseAmount = 0, // line item subtotal or cart subtotal
  existingDiscount = null,
  userRole = 'cashier',
  onApplyDiscount,
  onRemoveDiscount
}) {
  const { format: formatCurrency, getCode: getCurrencyMetadata } = useCurrency();
  const [discountType, setDiscountType] = useState('percentage'); // 'percentage' | 'fixed'
  const [discountValue, setDiscountValue] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  
  // Manager Approval State — mirrors the refund flow's credential pattern
  // (select a real manager/admin account, verify their actual password
  // server-side). There is no PIN system anywhere in this app; a bare PIN
  // field with no backend to check it against is not real authorization.
  const [managersList, setManagersList] = useState([]);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [verifyingApproval, setVerifyingApproval] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (existingDiscount) {
        setDiscountType(existingDiscount.discountType || 'percentage');
        setDiscountValue(existingDiscount.discountValue?.toString() || '');
        setReason(existingDiscount.discountReason || '');
      } else {
        setDiscountType('percentage');
        setDiscountValue('');
        setReason('');
        setCustomReason('');
      }
      setManagerPassword('');
      setApprovalError('');

      employeesAPI.getAll()
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : (res.data?.employees || []);
          const managers = list.filter((e) => e.role === 'manager' || e.role === 'admin');
          setManagersList(managers);
          if (managers.length > 0) {
            setSelectedManagerId(String(managers[0].id));
          }
        })
        .catch((err) => {
          console.error('Failed to fetch managers:', err);
        });
    }
  }, [isOpen, existingDiscount]);

  if (!isOpen) return null;

  const numVal = parseFloat(discountValue) || 0;
  let calculatedDiscount = 0;
  if (discountType === 'percentage') {
    calculatedDiscount = Math.min(baseAmount, (baseAmount * numVal) / 100);
  } else {
    calculatedDiscount = Math.min(baseAmount, numVal);
  }
  const finalPrice = Math.max(0, baseAmount - calculatedDiscount);

  // Threshold: percentage > 10% or fixed > 50 / 500
  const isAboveThreshold = (discountType === 'percentage' && numVal > 10) || (discountType === 'fixed' && numVal > 50);
  const requiresManagerApproval = (userRole === 'cashier' || userRole === 'employee') && isAboveThreshold;

  const handleApply = async (e) => {
    e?.preventDefault();
    if (numVal <= 0) return;

    const finalReasonText = reason === 'Other' ? (customReason || 'Other') : (reason || 'Discretionary Discount');

    if (requiresManagerApproval) {
      if (!selectedManagerId) {
        setApprovalError('Select the approving manager.');
        return;
      }
      if (!managerPassword.trim()) {
        setApprovalError('Manager password is required for discounts above the threshold.');
        return;
      }

      // We do NOT verify the credential here and trust the result — the
      // credential is submitted with the sale itself and re-checked
      // server-side (Sale.create rejects the sale if it doesn't validate).
      // This is only a local completeness check before submitting.
      setVerifyingApproval(true);
      setApprovalError('');
      onApplyDiscount({
        discountType,
        discountValue: numVal,
        discountAmount: calculatedDiscount,
        discountReason: finalReasonText,
        managerApprovalId: selectedManagerId,
        managerPassword: managerPassword
      });
      setVerifyingApproval(false);
      onClose();
    } else {
      onApplyDiscount({
        discountType,
        discountValue: numVal,
        discountAmount: calculatedDiscount,
        discountReason: finalReasonText,
        managerApprovalId: null,
        managerPassword: null
      });
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border-default rounded-3xl shadow-2xl w-full max-w-md p-5 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <TagIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-h3 font-bold text-text-primary">
                {target === 'item' ? `Item Discount: ${item?.name}` : 'Cart Manual Discount'}
              </h3>
              <p className="text-caption text-text-muted">
                Base Amount: <span className="font-bold text-text-primary">{formatCurrency(baseAmount)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded-xl transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Discount Type Toggle */}
        <div className="grid grid-cols-2 gap-2 bg-surface-2 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setDiscountType('percentage')}
            className={`py-2 text-caption font-bold rounded-lg transition-all ${
              discountType === 'percentage'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Percentage (% Off)
          </button>
          <button
            type="button"
            onClick={() => setDiscountType('fixed')}
            className={`py-2 text-caption font-bold rounded-lg transition-all ${
              discountType === 'fixed'
                ? 'bg-surface text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Fixed Amount ({getCurrencyMetadata()?.symbol || 'KSh'} Off)
          </button>
        </div>

        {/* Discount Value Input & Quick Presets */}
        <div className="space-y-2">
          <label className="block text-caption font-semibold text-text-secondary">
            Discount Value {discountType === 'percentage' ? '(%)' : ''}
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max={discountType === 'percentage' ? '100' : baseAmount}
              step={discountType === 'percentage' ? '1' : '0.01'}
              placeholder={discountType === 'percentage' ? 'e.g. 10' : '0.00'}
              value={discountValue}
              onChange={(e) => {
                setDiscountValue(e.target.value);
                setPinError('');
              }}
              className="w-full px-3.5 py-2.5 bg-surface border border-border-default text-text-primary font-bold text-h3 rounded-xl focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-caption font-bold text-text-muted">
              {discountType === 'percentage' ? '%' : (getCurrencyMetadata()?.symbol || 'KSh')}
            </span>
          </div>

          {/* Quick preset chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {(discountType === 'percentage' ? [5, 10, 15, 20, 25, 50] : [10, 20, 50, 100, 200, 500]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDiscountValue(preset.toString())}
                className="px-2.5 py-1 text-caption font-semibold bg-surface border border-border-default rounded-lg text-text-secondary hover:border-primary hover:text-primary transition-all shrink-0"
              >
                {discountType === 'percentage' ? `${preset}%` : formatCurrency(preset)}
              </button>
            ))}
          </div>
        </div>

        {/* Live Calculation Preview */}
        {numVal > 0 && (
          <div className="p-3 bg-surface-2/40 border border-border-default rounded-xl space-y-1 text-caption">
            <div className="flex justify-between text-text-secondary">
              <span>Savings:</span>
              <span className="font-bold text-success">-{formatCurrency(calculatedDiscount)}</span>
            </div>
            <div className="flex justify-between text-text-primary font-bold pt-1 border-t border-border-default">
              <span>New Price:</span>
              <span className="text-primary text-small">{formatCurrency(finalPrice)}</span>
            </div>
          </div>
        )}

        {/* Reason Selector */}
        <div className="space-y-1.5">
          <label className="block text-caption font-semibold text-text-secondary">Discount Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 bg-surface text-text-primary border border-border-default rounded-xl text-small focus:ring-2 focus:ring-primary/30"
          >
            <option value="">-- Select a reason --</option>
            {COMMON_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
            <option value="Other">Other (specify)</option>
          </select>

          {reason === 'Other' && (
            <input
              type="text"
              placeholder="Enter discount reason..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="w-full mt-1.5 px-3 py-1.5 bg-surface border border-border-default text-text-primary rounded-lg text-small"
              maxLength={100}
            />
          )}
        </div>

        {/* Manager Approval Section (Option B) */}
        {requiresManagerApproval && (
          <div className="p-3.5 bg-warning/10 border border-warning/30 rounded-2xl space-y-2 animate-fadeIn">
            <div className="flex items-center space-x-2 text-warning">
              <LockClosedIcon className="h-5 w-5 shrink-0" />
              <p className="text-caption font-bold">Manager Approval Required</p>
            </div>
            <p className="text-[11px] text-text-muted">
              Discounts above 10% / {getCurrencyMetadata()?.symbol || 'KSh'}50 require a manager or
              admin to authorize with their own password.
            </p>

            <select
              value={selectedManagerId}
              onChange={(e) => {
                setSelectedManagerId(e.target.value);
                setApprovalError('');
              }}
              className="w-full px-3 py-2 bg-surface border border-border-default text-text-primary rounded-xl text-small focus:ring-2 focus:ring-warning/40"
            >
              {managersList.length === 0 && <option value="">No managers found</option>}
              {managersList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email}
                </option>
              ))}
            </select>

            <input
              type="password"
              placeholder="Manager's password"
              value={managerPassword}
              onChange={(e) => {
                setManagerPassword(e.target.value);
                setApprovalError('');
              }}
              className="w-full px-3 py-2 bg-surface border border-border-default text-text-primary rounded-xl text-small tracking-widest font-mono focus:ring-2 focus:ring-warning/40"
              maxLength={100}
            />
            {approvalError && (
              <p className="text-[11px] text-danger font-semibold">⚠️ {approvalError}</p>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-2 pt-2 border-t border-border-default">
          {existingDiscount && (
            <Button
              type="button"
              variant="outline"
              size="md"
              className="text-danger hover:border-danger/40"
              onClick={() => {
                onRemoveDiscount();
                onClose();
              }}
            >
              Remove
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="md"
            className="flex-1"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="flex-1 font-bold"
            onClick={handleApply}
            disabled={numVal <= 0 || (requiresManagerApproval && (!selectedManagerId || !managerPassword.trim()))}
            loading={verifyingApproval}
          >
            Apply Discount
          </Button>
        </div>
      </div>
    </div>
  );
}
