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
import Button from './ui/Button';
import Badge from './ui/Badge';

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
      const maxAttempts = 30;

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
        customerEmail: currentSale.customer?.email || 'customer@example.com',
        customerName: currentSale.customer?.name || 'Walk-in Customer',
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

  useEffect(() => {
    if (currentSale.customer?.phone) {
      setMpesaPhone(currentSale.customer.phone);
    }
  }, [currentSale.customer?.phone]);

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
          name: currentSale.customer?.name,
          phone: mpesaPhone,
          email: currentSale.customer?.email,
          location: currentSale.customer?.location
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
      const maxAttempts = 30;

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
          name: currentSale.customer?.name,
          phone: currentSale.customer?.phone || mpesaPhone,
          email: currentSale.customer?.email,
          location: currentSale.customer?.location
        },
        customerId: currentSale.customerId || null,
        notes: currentSale.notes
      };

      const response = await api.post('/api/card/initiate', {
        amount: currentSale.total,
        currency: 'KES',
        customerEmail: currentSale.customer?.email || 'customer@example.com',
        customerName: currentSale.customer?.name || 'Walk-in Customer',
        orderId,
        saleData
      });

      const { paymentReference, redirectUrl } = response.data;
      setCardRef(paymentReference);
      setCardUrl(redirectUrl);
      setPaymentStatus('redirected');

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

  const enteredAmount = parseFloat(currentSale.paymentAmount || 0);
  const changeDue = Math.max(0, enteredAmount - currentSale.total);

  return (
    <div 
      className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fadeIn"
      onClick={withTrustedClick(onClose)}
    >
      <div 
        className="bg-surface border border-border-default rounded-3xl shadow-2xl w-full max-w-xl p-5 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-border-default pb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <BanknotesIcon className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-h3 font-bold text-text-primary">Complete Payment</h3>
              <p className="text-caption text-text-muted">Select method and verify transaction amount</p>
            </div>
          </div>
          <button
            type="button"
            onClick={withTrustedClick(onClose)}
            disabled={paymentStatus === 'initiating' || paymentStatus === 'polling'}
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded-xl transition-colors disabled:opacity-30"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Top Summary Banner: Total Due + Customer Info inline */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-surface-2/40 border border-border-default rounded-2xl">
          <div>
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">Total Due</span>
            <p className="text-h2 font-extrabold text-primary leading-tight">{formatCurrency(currentSale.total)}</p>
          </div>
          <div className="text-right">
            <span className="text-caption font-semibold text-text-muted uppercase tracking-wider">Customer</span>
            <p className="text-small font-bold text-text-primary truncate">{currentSale.customer?.name || 'Walk-in Customer'}</p>
            {currentSale.customer?.phone && (
              <p className="text-caption text-text-muted font-mono">{currentSale.customer?.phone}</p>
            )}
          </div>
        </div>

        {/* Payment Methods Selector */}
        <div className="space-y-1.5">
          <label className="block text-caption font-semibold text-text-secondary uppercase tracking-wider">Payment Method</label>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'cash' }));
                handleCancelPayment();
              })}
              className={`p-2.5 rounded-xl border transition-all flex flex-col items-center justify-center space-y-1 disabled:opacity-40 ${
                isCash
                  ? 'border-primary bg-primary/10 text-primary shadow-2xs font-bold'
                  : 'border-border-default bg-surface text-text-secondary hover:border-primary/40'
              }`}
            >
              <BanknotesIcon className="h-5 w-5" />
              <span className="text-caption font-semibold">Cash</span>
            </button>
            
            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'card' }));
                handleCancelPayment();
              })}
              className={`p-2.5 rounded-xl border transition-all flex flex-col items-center justify-center space-y-1 disabled:opacity-40 ${
                isCard
                  ? 'border-primary bg-primary/10 text-primary shadow-2xs font-bold'
                  : 'border-border-default bg-surface text-text-secondary hover:border-primary/40'
              }`}
            >
              <CreditCardIcon className="h-5 w-5" />
              <span className="text-caption font-semibold">Card</span>
            </button>
            
            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'mobile' }));
                handleCancelPayment();
              })}
              className={`p-2.5 rounded-xl border transition-all flex flex-col items-center justify-center space-y-1 disabled:opacity-40 ${
                isMpesa
                  ? 'border-primary bg-primary/10 text-primary shadow-2xs font-bold'
                  : 'border-border-default bg-surface text-text-secondary hover:border-primary/40'
              }`}
            >
              <DevicePhoneMobileIcon className="h-5 w-5" />
              <span className="text-caption font-semibold">M-PESA</span>
            </button>

            <button
              type="button"
              disabled={paymentStatus !== 'idle' && paymentStatus !== 'failed'}
              onClick={withTrustedClick(() => {
                onUpdateSale(prev => ({ ...prev, paymentMethod: 'split' }));
                handleCancelPayment();
              })}
              className={`p-2.5 rounded-xl border transition-all flex flex-col items-center justify-center space-y-1 disabled:opacity-40 ${
                isSplit
                  ? 'border-primary bg-primary/10 text-primary shadow-2xs font-bold'
                  : 'border-border-default bg-surface text-text-secondary hover:border-primary/40'
              }`}
            >
              <ArrowsRightLeftIcon className="h-5 w-5" />
              <span className="text-caption font-semibold">Split</span>
            </button>
          </div>
        </div>

        {/* Dynamic Payment State Indicator */}
        {paymentStatus !== 'idle' && (
          <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl flex flex-col items-center justify-center text-center space-y-2">
            {(paymentStatus === 'initiating' || paymentStatus === 'polling') && (
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
            )}
            
            <div className="text-caption font-medium text-text-primary">
              {paymentStatus === 'initiating' && 'Connecting to payment gateway...'}
              {paymentStatus === 'polling' && `STK push sent to ${mpesaPhone}. Waiting for PIN approval...`}
              {paymentStatus === 'redirected' && 'Opening secure payment gateway window...'}
              {paymentStatus === 'failed' && 'Transaction was unsuccessful.'}
            </div>

            {paymentStatus === 'redirected' && (
              <div className="flex gap-2 w-full pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => window.open(cardUrl, '_blank', 'width=600,height=700')}>
                  Re-open Gateway
                </Button>
                <Button variant="primary" size="sm" className="flex-1" onClick={handleVerifyCardPayment}>
                  Verify Payment
                </Button>
              </div>
            )}

            {(paymentStatus === 'polling' || paymentStatus === 'redirected' || paymentStatus === 'failed') && (
              <button
                type="button"
                onClick={handleCancelPayment}
                className="text-caption text-danger hover:underline font-semibold"
              >
                Cancel / Change Method
              </button>
            )}
          </div>
        )}

        {/* CASH PAYMENT MODE CONTENT */}
        {isCash && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Amount Input */}
              <div className="space-y-1">
                <label className="block text-caption font-semibold text-text-secondary">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted font-bold text-small">
                    {getMetadata()?.symbol || 'KSh'}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentSale.paymentAmount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className="w-full p-2.5 pl-11 bg-surface border border-border-default text-text-primary font-bold text-h3 rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              {/* Realtime Change Calculation Box */}
              <div className="p-3 bg-surface-2/40 border border-border-default rounded-xl flex flex-col justify-between">
                <div className="flex justify-between items-center text-caption text-text-secondary">
                  <span>Balance / Return:</span>
                  <span>{formatCurrency(currentSale.total)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-border-default">
                  <span className="text-small font-bold text-text-primary">
                    {enteredAmount >= currentSale.total ? 'Change Due' : 'Shortage'}
                  </span>
                  <span className={`text-h2 font-extrabold ${enteredAmount >= currentSale.total ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(changeDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Compact Quick Preset Amount Buttons */}
            <div>
              <span className="block text-caption font-semibold text-text-muted mb-1.5 uppercase tracking-wider">Quick Presets</span>
              <div className="grid grid-cols-6 gap-1.5">
                {[10, 20, 50, 100, 200, 500].map(amount => (
                  <button
                    key={amount}
                    type="button"
                    onClick={withTrustedClick(() => {
                      onUpdateSale(prev => ({ ...prev, paymentAmount: amount.toString() }));
                      setPaymentError(null);
                      setLocalError(null);
                    })}
                    className="py-1.5 px-1 bg-surface border border-border-default rounded-lg text-caption font-semibold text-text-secondary hover:border-primary hover:text-primary hover:bg-primary/5 transition-all text-center"
                  >
                    {formatCurrency(amount)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* M-PESA PHONE INPUT */}
        {isMpesa && (paymentStatus === 'idle' || paymentStatus === 'failed') && (
          <div className="space-y-1 pt-1">
            <label className="block text-caption font-semibold text-text-secondary">M-Pesa Phone Number</label>
            <input
              type="tel"
              value={mpesaPhone}
              onChange={(e) => {
                setMpesaPhone(e.target.value);
                setLocalError(null);
              }}
              placeholder="e.g. 254712345678"
              className="w-full p-2.5 bg-surface border border-border-default text-text-primary text-body font-mono rounded-xl focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>
        )}

        {/* SPLIT PAYMENTS BUILDER */}
        {isSplit && (
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center">
              <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Split Payment Breakdown</span>
              <span className={`text-caption font-bold ${remainingBalance === 0 ? 'text-success' : 'text-danger'}`}>
                Bal: {formatCurrency(remainingBalance)}
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {splitLegs.map((leg, index) => (
                <div key={index} className="p-2 bg-surface border border-border-default rounded-xl flex items-center gap-2">
                  <select
                    value={leg.paymentMethod}
                    onChange={(e) => handleLegMethodChange(index, e.target.value)}
                    disabled={leg.status === 'confirmed'}
                    className="bg-surface-2 text-text-primary border border-border-default rounded-lg p-1.5 text-caption font-semibold"
                  >
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="card">Card</option>
                  </select>

                  <input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    value={leg.amount}
                    disabled={leg.status === 'confirmed'}
                    onChange={(e) => updateSplitLeg(index, { amount: e.target.value, localError: null })}
                    className="w-24 p-1.5 bg-surface border border-border-default rounded-lg text-caption font-bold text-text-primary"
                  />

                  <div className="flex-1 text-right">
                    <Badge variant={leg.status === 'confirmed' ? 'success' : 'warning'} size="sm">
                      {leg.status === 'confirmed' ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </div>

                  {splitLegs.length > 2 && (
                    <button type="button" onClick={() => removeSplitLeg(index)} className="text-danger p-1">
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {splitLegs.length < 3 && (
              <button
                type="button"
                onClick={addSplitLeg}
                className="w-full py-1.5 text-caption font-semibold text-primary hover:bg-primary/10 border border-dashed border-primary/30 rounded-xl transition-all"
              >
                + Add Payment Leg
              </button>
            )}
          </div>
        )}

        {/* Error Alert */}
        {(paymentError || localError) && (
          <div className="p-2.5 bg-danger/10 border border-danger/30 rounded-xl text-caption text-danger text-center font-medium">
            ⚠️ {localError || paymentError}
          </div>
        )}

        {/* Action Buttons Footer */}
        <div className="flex space-x-3 pt-2 border-t border-border-default">
          <Button
            type="button"
            variant="outline"
            size="md"
            className="flex-1"
            onClick={withTrustedClick(onClose)}
            disabled={paymentStatus === 'initiating' || paymentStatus === 'polling'}
          >
            Back to Cart
          </Button>

          {isCash && (
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1 font-bold"
              onClick={withTrustedClick(onPayment)}
              disabled={
                processingPayment || 
                !currentSale.paymentAmount || 
                isNaN(parseFloat(currentSale.paymentAmount)) ||
                parseFloat(currentSale.paymentAmount) < currentSale.total
              }
            >
              Complete Sale
            </Button>
          )}

          {isMpesa && (paymentStatus === 'idle' || paymentStatus === 'failed') && (
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1 font-bold"
              onClick={handleMpesaPay}
            >
              Send STK Push
            </Button>
          )}

          {isCard && (paymentStatus === 'idle' || paymentStatus === 'failed') && (
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1 font-bold"
              onClick={handleCardPay}
            >
              Pay with Card
            </Button>
          )}

          {isSplit && (
            <Button
              type="button"
              variant="primary"
              size="md"
              className="flex-1 font-bold"
              onClick={withTrustedClick(handleSplitComplete)}
              disabled={!canSubmitSplit}
            >
              Complete Sale
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}