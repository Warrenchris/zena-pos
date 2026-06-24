import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  BanknotesIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  ArrowsRightLeftIcon
} from '@heroicons/react/24/outline';
import { withTrustedClick } from '../utils/securityUtils';
import useCurrency from '../hooks/useCurrency';
import api from '../services/api';

export default function PaymentModal({
  isOpen,
  onClose,
  currentSale,
  onUpdateSale,
  onPayment,
  onPaymentSuccess,
  processingPayment,
  paymentError,
  setPaymentError
}) {
  const { format: formatCurrency, getCode: getMetadata } = useCurrency();
  
  const [paymentStatus, setPaymentStatus] = useState('idle'); // idle, initiating, polling, redirected, failed
  const [mpesaPhone, setMpesaPhone] = useState(currentSale.customer?.phone || '');
  const [checkoutRequestId, setCheckoutRequestId] = useState(null);
  const [cardRef, setCardRef] = useState(null);
  const [cardUrl, setCardUrl] = useState(null);
  const [localError, setLocalError] = useState(null);

  const [splitLegs, setSplitLegs] = useState([
    { paymentMethod: 'cash', amount: '', gatewayRef: null, status: 'confirmed', checkoutRequestId: null, cardRef: null, localError: null },
    { paymentMethod: 'mpesa', amount: '', gatewayRef: null, status: 'idle', checkoutRequestId: null, cardRef: null, localError: null }
  ]);

  const updateSplitLeg = (index, updates) => {
    setSplitLegs(prev => prev.map((leg, i) => i === index ? { ...leg, ...updates } : leg));
  };

  const addSplitLeg = () => {
    if (splitLegs.length < 3) {
      setSplitLegs(prev => [...prev, { paymentMethod: 'cash', amount: '', gatewayRef: null, status: 'confirmed', checkoutRequestId: null, cardRef: null, localError: null }]);
    }
  };

  const removeSplitLeg = (index) => {
    if (splitLegs.length > 2) {
      setSplitLegs(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleLegMethodChange = (index, method) => {
    const isCash = method === 'cash';
    updateSplitLeg(index, {
      paymentMethod: method,
      gatewayRef: null,
      status: isCash ? 'confirmed' : 'idle',
      checkoutRequestId: null,
      cardRef: null,
      localError: null
    });
  };

  const handleInitiateMpesaLeg = async (index, amount) => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      updateSplitLeg(index, { localError: 'Please enter a valid amount.' });
      return;
    }
    if (!mpesaPhone) {
      updateSplitLeg(index, { localError: 'Please enter a phone number.' });
      return;
    }

    updateSplitLeg(index, { status: 'initiating', localError: null });

    try {
      const orderId = 'ord-split-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const response = await api.post('/api/mpesa/initiate', {
        phone: mpesaPhone,
        amount: parseFloat(amount),
        orderId,
      });

      const { checkoutRequestId } = response.data;
      updateSplitLeg(index, { status: 'polling', checkoutRequestId });

      let attempts = 0;
      const maxAttempts = 30; // 90 seconds

      const mpesaLegInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await api.get(`/api/mpesa/status/${checkoutRequestId}`);
          const { status, gatewayRef } = statusRes.data;

          if (status === 'confirmed') {
            clearInterval(mpesaLegInterval);
            updateSplitLeg(index, { status: 'confirmed', gatewayRef: gatewayRef || 'CONFIRMED' });
          } else if (status === 'failed') {
            clearInterval(mpesaLegInterval);
            updateSplitLeg(index, { status: 'failed', localError: 'Failed' });
          }
        } catch (pollErr) {
          console.error('M-Pesa polling error on split leg:', pollErr);
        }

        if (attempts >= maxAttempts) {
          clearInterval(mpesaLegInterval);
          updateSplitLeg(index, { status: 'failed', localError: 'Timed out' });
        }
      }, 3000);

    } catch (err) {
      console.error('M-Pesa split leg failed:', err);
      updateSplitLeg(index, { status: 'failed', localError: err.response?.data?.error || err.message || 'Failed' });
    }
  };

  const handleInitiateCardLeg = async (index, amount) => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      updateSplitLeg(index, { localError: 'Please enter a valid amount.' });
      return;
    }

    updateSplitLeg(index, { status: 'initiating', localError: null });

    try {
      const orderId = 'ord-split-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const response = await api.post('/api/card/initiate', {
        amount: parseFloat(amount),
        currency: 'KES',
        customerEmail: currentSale.customer.email || 'customer@example.com',
        customerName: currentSale.customer.name || 'Walk-in Customer',
        orderId,
      });

      const { paymentReference, redirectUrl } = response.data;
      updateSplitLeg(index, { status: 'redirected', cardRef: paymentReference });

      if (redirectUrl) {
        window.open(redirectUrl, '_blank', 'width=600,height=700');
      }
    } catch (err) {
      console.error('Card split leg failed:', err);
      updateSplitLeg(index, { status: 'failed', localError: err.response?.data?.error || err.message || 'Failed' });
    }
  };

  const handleVerifyCardLeg = async (index) => {
    const leg = splitLegs[index];
    if (!leg.cardRef) return;

    updateSplitLeg(index, { status: 'initiating', localError: null });

    try {
      const verifyRes = await api.post('/api/card/verify', { reference: leg.cardRef });
      const { verified } = verifyRes.data;

      if (verified) {
        updateSplitLeg(index, { status: 'confirmed', gatewayRef: leg.cardRef });
      } else {
        updateSplitLeg(index, { status: 'failed', localError: 'Not completed.' });
      }
    } catch (err) {
      console.error('Card verification failed on split leg:', err);
      updateSplitLeg(index, { status: 'failed', localError: err.response?.data?.error || err.message || 'Failed' });
    }
  };

  const handleSplitComplete = async () => {
    const sum = splitLegs.reduce((s, leg) => s + (parseFloat(leg.amount) || 0), 0);
    if (Math.abs(sum - currentSale.total) > 0.01) {
      setLocalError('Remaining balance must be exactly zero.');
      return;
    }

    const unconfirmedLeg = splitLegs.find(leg => leg.paymentMethod !== 'cash' && !leg.gatewayRef);
    if (unconfirmedLeg) {
      setLocalError('All M-Pesa and Card legs must be confirmed.');
      return;
    }

    try {
      const saleData = {
        items: currentSale.items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        total: parseFloat(currentSale.total),
        customerId: currentSale.customerId || null,
        customer: currentSale.customer,
        notes: currentSale.notes,
        payments: splitLegs.map(leg => ({
          paymentMethod: leg.paymentMethod,
          amount: parseFloat(leg.amount),
          gatewayRef: leg.gatewayRef
        }))
      };

      const response = await api.post('/api/sales/split', saleData);
      onPaymentSuccess(response.data);
    } catch (err) {
      console.error('Split sale submission failed:', err);
      setLocalError(err.response?.data?.error || err.message || 'Failed to submit split sale.');
    }
  };

  // Synchronize phone number from currentSale customer phone
  useEffect(() => {
    if (currentSale.customer?.phone) {
      setMpesaPhone(currentSale.customer.phone);
    }
  }, [currentSale.customer?.phone]);

  // Clean up interval on close or unmount
  useEffect(() => {
    return () => {
      if (window.mpesaInterval) {
        clearInterval(window.mpesaInterval);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleAmountChange = (value) => {
    if (value === '' || (!isNaN(value) && parseFloat(value) >= 0)) {
      onUpdateSale(prev => ({ ...prev, paymentAmount: value }));
      setPaymentError(null);
      setLocalError(null);
    }
  };

  const handleMpesaPay = async () => {
    if (!mpesaPhone) {
      setLocalError('Please enter a valid phone number.');
      return;
    }

    setPaymentStatus('initiating');
    setLocalError(null);
    setPaymentError(null);

    try {
      const orderId = 'ord-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const saleData = {
        items: currentSale.items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        total: parseFloat(currentSale.total),
        paymentMethod: 'mobile',
        paymentAmount: parseFloat(currentSale.total),
        customer: {
          name: currentSale.customer.name,
          phone: mpesaPhone,
          email: currentSale.customer.email,
          location: currentSale.customer.location
        },
        customerId: currentSale.customerId || null,
        notes: currentSale.notes
      };

      const response = await api.post('/api/mpesa/initiate', {
        phone: mpesaPhone,
        amount: currentSale.total,
        orderId,
        saleData
      });

      const { checkoutRequestId } = response.data;
      setCheckoutRequestId(checkoutRequestId);
      setPaymentStatus('polling');

      let attempts = 0;
      const maxAttempts = 30; // 90 seconds / 3 seconds

      if (window.mpesaInterval) {
        clearInterval(window.mpesaInterval);
      }

      window.mpesaInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await api.get(`/api/mpesa/status/${checkoutRequestId}`);
          const { status, saleId } = statusRes.data;

          if (status === 'confirmed') {
            clearInterval(window.mpesaInterval);
            setPaymentStatus('idle');
            onPaymentSuccess({ id: saleId || 'latest' });
          } else if (status === 'failed') {
            clearInterval(window.mpesaInterval);
            setPaymentStatus('failed');
            setLocalError('M-Pesa payment was declined or cancelled by the user.');
          }
        } catch (pollErr) {
          console.error('M-Pesa polling error:', pollErr);
        }

        if (attempts >= maxAttempts) {
          clearInterval(window.mpesaInterval);
          setPaymentStatus('failed');
          setLocalError('Payment request timed out. Please try again.');
        }
      }, 3000);

    } catch (err) {
      console.error('M-Pesa initiation failed:', err);
      setPaymentStatus('failed');
      setLocalError(err.response?.data?.error || err.message || 'Failed to send M-Pesa STK Push.');
    }
  };

  const handleCardPay = async () => {
    setPaymentStatus('initiating');
    setLocalError(null);
    setPaymentError(null);

    try {
      const orderId = 'ord-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
      const saleData = {
        items: currentSale.items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        total: parseFloat(currentSale.total),
        paymentMethod: 'card',
        paymentAmount: parseFloat(currentSale.total),
        customer: {
          name: currentSale.customer.name,
          phone: currentSale.customer.phone || mpesaPhone,
          email: currentSale.customer.email,
          location: currentSale.customer.location
        },
        customerId: currentSale.customerId || null,
        notes: currentSale.notes
      };

      const response = await api.post('/api/card/initiate', {
        amount: currentSale.total,
        currency: 'KES',
        customerEmail: currentSale.customer.email || 'customer@example.com',
        customerName: currentSale.customer.name || 'Walk-in Customer',
        orderId,
        saleData
      });

      const { paymentReference, redirectUrl } = response.data;
      setCardRef(paymentReference);
      setCardUrl(redirectUrl);
      setPaymentStatus('redirected');

      // Attempt to load inline checkout or open in new tab
      if (redirectUrl) {
        window.open(redirectUrl, '_blank', 'width=600,height=700');
      }
    } catch (err) {
      console.error('Card payment initiation failed:', err);
      setPaymentStatus('failed');
      setLocalError(err.response?.data?.error || err.message || 'Failed to initiate card payment.');
    }
  };

  const handleVerifyCardPayment = async () => {
    if (!cardRef) return;
    setPaymentStatus('initiating');
    setLocalError(null);

    try {
      const verifyRes = await api.post('/api/card/verify', { reference: cardRef });
      const { verified, sale } = verifyRes.data;

      if (verified) {
        setPaymentStatus('idle');
        onPaymentSuccess(sale || { id: 'latest' });
      } else {
        setPaymentStatus('failed');
        setLocalError('Payment has not been completed or was declined.');
      }
    } catch (err) {
      console.error('Card verification failed:', err);
      setPaymentStatus('failed');
      setLocalError(err.response?.data?.error || err.message || 'Verification failed.');
    }
  };

  const handleCancelPayment = () => {
    if (window.mpesaInterval) {
      clearInterval(window.mpesaInterval);
    }
    setPaymentStatus('idle');
    setLocalError(null);
    setPaymentError(null);
  };

  const isCash = currentSale.paymentMethod === 'cash';
  const isMpesa = currentSale.paymentMethod === 'mobile';
  const isCard = currentSale.paymentMethod === 'card';
  const isSplit = currentSale.paymentMethod === 'split';

  const sumLegs = splitLegs.reduce((sum, leg) => sum + (parseFloat(leg.amount) || 0), 0);
  const remainingBalance = currentSale.total - sumLegs;
  const allLegsConfirmed = splitLegs.every(leg => leg.paymentMethod === 'cash' || leg.gatewayRef);
  const canSubmitSplit = Math.abs(remainingBalance) < 0.01 && allLegsConfirmed && splitLegs.length >= 2;

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
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
            disabled={paymentStatus === 'initiating' || paymentStatus === 'polling'}
            className="text-gray-400 hover:text-brand-yellow transition-colors disabled:opacity-30"
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
          {currentSale.customer.phone && (
            <p className="text-sm text-gray-300">
              <strong className="text-gray-200">Phone:</strong> {currentSale.customer.phone}
            </p>
          )}
        </div>
        
        {/* Payment Methods */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">Payment Method</label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'cash' }));
                handleCancelPayment();
              })}
              className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 disabled:opacity-40 ${
                isCash
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-700 hover:border-brand-yellow/50'
              }`}
            >
              <BanknotesIcon className={`h-6 w-6 ${isCash ? 'text-brand-yellow' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium ${isCash ? 'text-brand-yellow' : 'text-gray-400'}`}>Cash</span>
            </button>
            
            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'card' }));
                handleCancelPayment();
              })}
              className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 disabled:opacity-40 ${
                isCard
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-700 hover:border-brand-yellow/50'
              }`}
            >
              <CreditCardIcon className={`h-6 w-6 ${isCard ? 'text-brand-yellow' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium ${isCard ? 'text-brand-yellow' : 'text-gray-400'}`}>Card</span>
            </button>
            
            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'mobile' }));
                handleCancelPayment();
              })}
              className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 disabled:opacity-40 ${
                isMpesa
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-700 hover:border-brand-yellow/50'
              }`}
            >
              <DevicePhoneMobileIcon className={`h-6 w-6 ${isMpesa ? 'text-brand-yellow' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium ${isMpesa ? 'text-brand-yellow' : 'text-gray-400'}`}>M-PESA</span>
            </button>

            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'split' }));
                handleCancelPayment();
              })}
              className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 disabled:opacity-40 ${
                isSplit
                  ? 'border-brand-yellow bg-brand-yellow/10'
                  : 'border-gray-700 hover:border-brand-yellow/50'
              }`}
            >
              <ArrowsRightLeftIcon className={`h-6 w-6 ${isSplit ? 'text-brand-yellow' : 'text-gray-400'}`} />
              <span className={`text-xs font-medium ${isSplit ? 'text-brand-yellow' : 'text-gray-400'}`}>Split</span>
            </button>
          </div>
        </div>

        {/* Dynamic Payment State Panel */}
        {paymentStatus !== 'idle' && (
          <div className="mb-6 p-5 bg-[#0b0b0c] border border-brand-yellow/20 rounded-xl flex flex-col items-center justify-center text-center space-y-4">
            {(paymentStatus === 'initiating' || paymentStatus === 'polling') && (
              <div className="w-12 h-12 border-4 border-brand-yellow border-t-transparent rounded-full animate-spin"></div>
            )}
            
            <div className="text-sm font-medium text-gray-200 animate-pulse">
              {paymentStatus === 'initiating' && 'Connecting to gateway...'}
              {paymentStatus === 'polling' && `STK push sent to ${mpesaPhone}. Waiting for customer confirmation...`}
              {paymentStatus === 'redirected' && 'Opening secure payment gateway window...'}
              {paymentStatus === 'failed' && 'Transaction was unsuccessful.'}
            </div>

            {paymentStatus === 'redirected' && (
              <div className="flex flex-col space-y-2 w-full">
                <button
                  type="button"
                  onClick={() => window.open(cardUrl, '_blank', 'width=600,height=700')}
                  className="w-full py-2.5 bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/30 hover:bg-brand-yellow/20 rounded-lg text-sm font-medium transition-all"
                >
                  Re-open Payment Gateway
                </button>
                <button
                  type="button"
                  onClick={handleVerifyCardPayment}
                  className="w-full py-2.5 bg-brand-yellow text-brand-black font-bold hover:bg-brand-yellowDark rounded-lg text-sm transition-all shadow-md"
                >
                  Verify Payment Status
                </button>
              </div>
            )}

            {(paymentStatus === 'polling' || paymentStatus === 'redirected' || paymentStatus === 'failed') && (
              <button
                type="button"
                onClick={handleCancelPayment}
                className="text-xs text-red-400 hover:text-red-300 font-semibold underline mt-2"
              >
                Cancel / Choose Another Method
              </button>
            )}
          </div>
        )}

        {/* Traditional Inputs for Cash only */}
        {isCash && (
          <>
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
                    paymentError || localError
                      ? 'border-red-500 focus:ring-2 focus:ring-red-500'
                      : 'border-gray-700 focus:ring-2 focus:ring-brand-yellow'
                  } focus:border-transparent`}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
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
                    setLocalError(null);
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
          </>
        )}

        {/* Dedicated Phone Input for M-Pesa when Idle/Failed */}
        {isMpesa && (paymentStatus === 'idle' || paymentStatus === 'failed') && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              M-Pesa Phone Number (2547XXXXXXXX)
            </label>
            <input
              type="tel"
              value={mpesaPhone}
              onChange={(e) => {
                setMpesaPhone(e.target.value);
                setLocalError(null);
              }}
              placeholder="e.g. 0712345678"
              className="w-full p-4 bg-brand-black border border-gray-700 rounded-xl text-lg text-gray-100 focus:ring-2 focus:ring-brand-yellow focus:border-transparent placeholder:text-gray-500"
              autoFocus
            />
          </div>
        )}

        {/* Split Payments Leg Builder */}
        {isSplit && (
          <div className="mb-6 space-y-4">
            <h4 className="font-semibold text-brand-yellow">Split Payment Legs</h4>
            
            {/* Phone Input specifically for M-Pesa legs inside Split Payment */}
            {splitLegs.some(l => l.paymentMethod === 'mpesa') && (
              <div className="p-3 bg-brand-black/50 border border-gray-800 rounded-xl space-y-2">
                <label className="block text-xs font-medium text-gray-400">
                  M-Pesa Phone Number (for M-Pesa legs)
                </label>
                <input
                  type="tel"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="e.g. 0712345678"
                  className="w-full p-2 bg-brand-black border border-gray-700 rounded-lg text-sm text-gray-100 placeholder:text-gray-500 focus:ring-1 focus:ring-brand-yellow focus:border-transparent"
                />
              </div>
            )}

            <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1">
              {splitLegs.map((leg, index) => (
                <div key={index} className="p-3 bg-brand-black border border-gray-800 rounded-xl space-y-2 relative">
                  <div className="flex items-center space-x-2">
                    <select
                      value={leg.paymentMethod}
                      onChange={(e) => handleLegMethodChange(index, e.target.value)}
                      disabled={leg.status === 'polling' || leg.status === 'initiating' || leg.status === 'confirmed'}
                      className="bg-brand-black text-gray-200 border border-gray-700 rounded-lg p-2 text-xs focus:ring-1 focus:ring-brand-yellow focus:border-transparent"
                    >
                      <option value="cash">Cash</option>
                      <option value="mpesa">M-Pesa</option>
                      <option value="card">Card</option>
                    </select>

                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                        {getMetadata()?.symbol}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={leg.amount}
                        disabled={leg.status === 'polling' || leg.status === 'initiating' || leg.status === 'confirmed'}
                        onChange={(e) => updateSplitLeg(index, { amount: e.target.value, localError: null })}
                        className="w-full p-2 pl-6 bg-brand-black border border-gray-700 rounded-lg text-sm text-gray-100 focus:ring-1 focus:ring-brand-yellow focus:border-transparent"
                      />
                    </div>

                    {splitLegs.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeSplitLeg(index)}
                        disabled={leg.status === 'polling' || leg.status === 'initiating' || leg.status === 'confirmed'}
                        className="p-2 text-red-400 hover:text-red-300 disabled:opacity-30"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* Leg Payment Status/Actions */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-400">
                      Status: {' '}
                      <strong className={
                        leg.status === 'confirmed' ? 'text-emerald-400' :
                        leg.status === 'polling' || leg.status === 'initiating' ? 'text-amber-400' :
                        'text-gray-400'
                      }>
                        {leg.status === 'confirmed' && '✓ Paid'}
                        {leg.status === 'polling' && 'Waiting for push...'}
                        {leg.status === 'initiating' && 'Initiating...'}
                        {leg.status === 'redirected' && 'Redirected'}
                        {leg.status === 'idle' && 'Unpaid'}
                        {leg.status === 'failed' && 'Failed'}
                      </strong>
                    </span>

                    {/* Action buttons per leg */}
                    {leg.paymentMethod === 'mpesa' && leg.status !== 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => handleInitiateMpesaLeg(index, leg.amount)}
                        disabled={leg.status === 'polling' || leg.status === 'initiating' || !leg.amount}
                        className="px-2.5 py-1 bg-brand-yellow text-brand-black rounded font-bold hover:bg-brand-yellowDark disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Request M-Pesa
                      </button>
                    )}

                    {leg.paymentMethod === 'card' && leg.status === 'idle' && (
                      <button
                        type="button"
                        onClick={() => handleInitiateCardLeg(index, leg.amount)}
                        disabled={!leg.amount}
                        className="px-2.5 py-1 bg-brand-yellow text-brand-black rounded font-bold hover:bg-brand-yellowDark disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Charge Card
                      </button>
                    )}

                    {leg.paymentMethod === 'card' && leg.status === 'redirected' && (
                      <div className="flex space-x-1">
                        <button
                          type="button"
                          onClick={() => handleVerifyCardLeg(index)}
                          className="px-2 py-1 bg-brand-yellow text-brand-black rounded font-bold hover:bg-brand-yellowDark"
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSplitLeg(index, { status: 'idle', cardRef: null })}
                          className="px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </div>

                  {leg.localError && (
                    <div className="text-[10px] text-red-400 font-medium">
                      ⚠ {leg.localError}
                    </div>
                  )}
                  {leg.gatewayRef && (
                    <div className="text-[10px] text-emerald-400 font-mono">
                      Ref: {leg.gatewayRef}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {splitLegs.length < 3 && (
              <button
                type="button"
                onClick={addSplitLeg}
                className="w-full py-2 bg-brand-black hover:bg-brand-black/50 border border-gray-700 rounded-xl text-xs font-semibold text-gray-300 hover:text-brand-yellow transition-all"
              >
                + Add Payment Leg
              </button>
            )}

            {/* Remaining Balance Display */}
            <div className="p-3 bg-brand-black rounded-xl border border-brand-yellow/10 flex justify-between items-center text-sm font-semibold">
              <span className="text-gray-400">Remaining Balance</span>
              <span className={
                remainingBalance === 0 ? 'text-emerald-400 font-bold' :
                remainingBalance < 0 ? 'text-red-400 font-bold animate-pulse' :
                'text-amber-400 font-bold'
              }>
                {formatCurrency(remainingBalance)}
              </span>
            </div>
          </div>
        )}

        {/* Errors Display */}
        {(paymentError || localError) && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 text-center font-medium animate-fadeIn">
            ⚠️ {localError || paymentError}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={withTrustedClick(onClose)}
            disabled={paymentStatus === 'initiating' || paymentStatus === 'polling'}
            className="flex-1 py-3 border border-gray-700 text-gray-300 rounded-xl hover:border-brand-yellow/50 hover:text-brand-yellow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back to Cart
          </button>

          {isCash && (
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
              Complete Sale
            </button>
          )}

          {isMpesa && (paymentStatus === 'idle' || paymentStatus === 'failed') && (
            <button
              type="button"
              onClick={handleMpesaPay}
              className="flex-1 py-3 bg-brand-yellow text-brand-black rounded-xl font-bold hover:bg-brand-yellowDark transition-all duration-200"
            >
              Send STK Push
            </button>
          )}

          {isCard && (paymentStatus === 'idle' || paymentStatus === 'failed') && (
            <button
              type="button"
              onClick={handleCardPay}
              className="flex-1 py-3 bg-brand-yellow text-brand-black rounded-xl font-bold hover:bg-brand-yellowDark transition-all duration-200"
            >
              Pay with Card
            </button>
          )}

          {isSplit && (
            <button
              type="button"
              onClick={withTrustedClick(handleSplitComplete)}
              disabled={!canSubmitSplit}
              className="flex-1 py-3 bg-brand-yellow text-brand-black rounded-xl font-bold hover:bg-brand-yellowDark disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Complete Sale
            </button>
          )}
        </div>
      </div>
    </div>
  );
}