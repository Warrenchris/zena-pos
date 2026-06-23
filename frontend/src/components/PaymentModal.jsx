import React from 'react';
import {
  XMarkIcon,
  BanknotesIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon
} from '@heroicons/react/24/outline';
import { withTrustedClick } from '../utils/securityUtils';
import useCurrency from '../hooks/useCurrency';

export default function PaymentModal({
  isOpen,
  onClose,
  currentSale,
  onUpdateSale,
  onPayment,
  processingPayment,
  paymentError,
  setPaymentError
}) {
  const { format: formatCurrency, getCode: getMetadata } = useCurrency();
  if (!isOpen) return null;

  const handleAmountChange = (value) => {
    if (value === '' || (!isNaN(value) && parseFloat(value) >= 0)) {
      onUpdateSale(prev => ({ ...prev, paymentAmount: value }));
      setPaymentError(null);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={withTrustedClick(onClose)}
    >
      <div 
        className="bg-brand-black/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 border border-brand-yellow/20 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-bold text-brand-yellow">Payment</h3>
          <button
            type="button"
            onClick={withTrustedClick(onClose)}
            className="text-gray-400 hover:text-brand-yellow transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        {/* Sale Summary */}
        <div className="mb-6 bg-brand-black rounded-xl p-4 border border-brand-yellow/10">
          <div className="flex justify-between items-center text-lg font-bold">
            <span className="text-gray-300">Total Due</span>
            <span className="text-brand-yellow">{formatCurrency(currentSale.total)}</span>
          </div>
        </div>
        
        {/* Customer Summary */}
        <div className="mb-6 p-4 bg-brand-black rounded-xl border border-brand-yellow/10">
          <h4 className="font-semibold text-brand-yellow mb-2">Customer Information</h4>
          <p className="text-sm text-gray-300">
            <strong className="text-gray-200">Name:</strong> {currentSale.customer.name}
          </p>
          {currentSale.customer.location && (
            <p className="text-sm text-gray-300">
              <strong className="text-gray-200">Location:</strong> {currentSale.customer.location}
            </p>
          )}
        </div>
        
        {/* Payment Methods */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Payment Method</label>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={withTrustedClick(() => onUpdateSale(prev => ({ ...prev, paymentMethod: 'cash' })))}
              className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                currentSale.paymentMethod === 'cash'
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-700 hover:border-brand-yellow/50'
              }`}
            >
              <BanknotesIcon className={`h-6 w-6 ${
                currentSale.paymentMethod === 'cash' ? 'text-brand-yellow' : 'text-gray-400'
              }`} />
              <span className={`text-sm font-medium ${
                currentSale.paymentMethod === 'cash' ? 'text-brand-yellow' : 'text-gray-400'
              }`}>Cash</span>
            </button>
            
            <button
              type="button"
              onClick={withTrustedClick(() => onUpdateSale(prev => ({ ...prev, paymentMethod: 'card' })))}
              className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                currentSale.paymentMethod === 'card'
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-700 hover:border-brand-yellow/50'
              }`}
            >
              <CreditCardIcon className={`h-6 w-6 ${
                currentSale.paymentMethod === 'card' ? 'text-brand-yellow' : 'text-gray-400'
              }`} />
              <span className={`text-sm font-medium ${
                currentSale.paymentMethod === 'card' ? 'text-brand-yellow' : 'text-gray-400'
              }`}>Card</span>
            </button>
            
            <button
              type="button"
              onClick={withTrustedClick(() => onUpdateSale(prev => ({ ...prev, paymentMethod: 'mobile' })))}
              className={`p-4 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                currentSale.paymentMethod === 'mobile'
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-700 hover:border-brand-yellow/50'
              }`}
            >
              <DevicePhoneMobileIcon className={`h-6 w-6 ${
                currentSale.paymentMethod === 'mobile' ? 'text-brand-yellow' : 'text-gray-400'
              }`} />
              <span className={`text-sm font-medium ${
                currentSale.paymentMethod === 'mobile' ? 'text-brand-yellow' : 'text-gray-400'
              }`}>M-PESA</span>
            </button>
          </div>
        </div>

        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Amount Received
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
              {getMetadata()?.symbol}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={currentSale.paymentAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className={`w-full p-4 pl-8 bg-brand-black border rounded-xl text-lg transition-all text-gray-100 ${
                paymentError
                  ? 'border-red-500 focus:ring-2 focus:ring-red-500'
                  : 'border-gray-700 focus:ring-2 focus:ring-brand-yellow'
              } focus:border-transparent`}
              placeholder="0.00"
              autoFocus
            />
            {currentSale.paymentAmount && !isNaN(parseFloat(currentSale.paymentAmount)) && (
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm">
                {parseFloat(currentSale.paymentAmount) >= currentSale.total ? (
                  <span className="text-green-400">✓ Sufficient</span>
                ) : (
                  <span className="text-brand-yellow">Insufficient</span>
                )}
              </div>
            )}
          </div>
          {paymentError && (
            <p className="mt-2 text-sm text-red-400">{paymentError}</p>
          )}
        </div>

        {/* Quick Amount Buttons */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[10, 20, 50, 100, 200, 500].map(amount => (
            <button
              key={amount}
              type="button"
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentAmount: amount.toString() }));
                setPaymentError(null);
              })}
              className="py-3 px-4 bg-brand-black border border-gray-700 rounded-xl text-sm font-medium text-gray-400 hover:border-brand-yellow/50 hover:text-brand-yellow transition-all duration-200"
            >
              {formatCurrency(amount)}
            </button>
          ))}
        </div>

        {/* Change Display */}
        {currentSale.paymentAmount && !isNaN(parseFloat(currentSale.paymentAmount)) && (
          <div className="mb-6 p-4 bg-brand-black rounded-xl space-y-2 border border-brand-yellow/10">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Amount Received</span>
              <span className="font-medium text-gray-200">{formatCurrency(parseFloat(currentSale.paymentAmount))}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Total Due</span>
              <span className="font-medium text-gray-200">-{formatCurrency(currentSale.total)}</span>
            </div>
            <div className="border-t border-gray-700 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-300">
                  {parseFloat(currentSale.paymentAmount) > currentSale.total ? 'Balance to Return' : 'Change Due'}
                </span>
                <span className={`text-xl font-bold ${
                  parseFloat(currentSale.paymentAmount) >= currentSale.total
                    ? 'text-brand-yellow'
                    : 'text-red-400'
                }`}>
                  {formatCurrency(Math.max(0, (parseFloat(currentSale.paymentAmount) - currentSale.total)))}
                </span>
              </div>
            </div>
          </div>
        )}

        {paymentError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 text-center font-medium animate-fadeIn">
            ⚠️ {paymentError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={withTrustedClick(onClose)}
            disabled={processingPayment}
            className="flex-1 py-3 border border-gray-700 text-gray-300 rounded-xl hover:border-brand-yellow/50 hover:text-brand-yellow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-700 disabled:hover:text-gray-300"
          >
            Back to Cart
          </button>
          <button
            type="button"
            onClick={withTrustedClick(onPayment)}
            disabled={
              processingPayment || 
              !currentSale.paymentAmount || 
              isNaN(parseFloat(currentSale.paymentAmount)) ||
              parseFloat(currentSale.paymentAmount) < currentSale.total
            }
            className="flex-1 py-3 bg-brand-yellow text-brand-black rounded-xl font-bold hover:bg-brand-yellowDark disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {processingPayment ? (
              <>
                <span className="opacity-0">Complete Sale</span>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-3 border-brand-black border-t-transparent rounded-full animate-spin" />
                </div>
              </>
            ) : (
              'Complete Sale'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}