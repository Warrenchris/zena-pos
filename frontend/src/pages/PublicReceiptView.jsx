import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { renderReceiptHtml } from '../printing/htmlReceipt';
import useCurrency from '../hooks/useCurrency';

/**
 * PublicReceiptView — Public, unauthenticated view of an online receipt copy.
 *
 * Route: /r/:token
 * Calls: GET /api/public/receipts/:token
 * Renders the receipt using the canonical renderReceiptHtml into an isolated iframe
 * with full print support.
 */
export default function PublicReceiptView() {
  const { token } = useParams();
  const { format: formatCurrency } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [receiptData, setReceiptData] = useState(null);
  const [paperWidth, setPaperWidth] = useState(80); // 80mm or 58mm
  const iframeRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchReceipt = async () => {
      try {
        const response = await axios.get(`/api/public/receipts/${token}`, {
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (isMounted) {
          setReceiptData(response.data);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          const status = err.response?.status;
          if (status === 404) {
            setError('This receipt may not be available yet. If the sale was made offline, please try again in a few minutes.');
          } else if (status === 429) {
            setError('Too many requests. Please wait a minute and try again.');
          } else {
            setError('Unable to load receipt. Please check your connection and try again.');
          }
          setLoading(false);
        }
      }
    };

    if (token) {
      fetchReceipt();
    } else {
      setError('No receipt token provided.');
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.focus();
      iframeRef.current.contentWindow.print();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-amber-700 rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-base font-bold text-slate-800">Loading Receipt</h2>
          <p className="text-xs text-slate-500 mt-1">Fetching receipt details...</p>
        </div>
      </div>
    );
  }

  if (error || !receiptData) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Receipt Unavailable</h2>
          <p className="text-sm text-slate-600 mb-6">{error || 'Receipt could not be loaded.'}</p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
          >
            Go to Zana POS
          </Link>
        </div>
      </div>
    );
  }

  // Generate canonical HTML for the receipt
  const receiptHtml = renderReceiptHtml(receiptData, {
    widthMm: paperWidth,
    formatMoney: formatCurrency,
  });

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 flex flex-col items-center">
      {/* Top action bar */}
      <div className="max-w-md w-full mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Width:</span>
          <button
            type="button"
            onClick={() => setPaperWidth(80)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              paperWidth === 80
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            80mm
          </button>
          <button
            type="button"
            onClick={() => setPaperWidth(58)}
            className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
              paperWidth === 58
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            58mm
          </button>
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-xl shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      {/* Embedded receipt preview container */}
      <div
        className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden transition-all duration-200"
        style={{
          width: paperWidth === 58 ? '360px' : '440px',
          minHeight: '520px',
        }}
      >
        <iframe
          ref={iframeRef}
          title="Public Receipt"
          srcDoc={receiptHtml}
          className="w-full h-[620px] border-none"
        />
      </div>

      <div className="mt-4 text-center">
        <p className="text-xs text-slate-400">
          Powered by{' '}
          <Link to="/" className="text-slate-600 hover:text-slate-900 font-semibold underline">
            Zana POS
          </Link>
        </p>
      </div>
    </div>
  );
}
