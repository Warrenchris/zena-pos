import React from 'react';
import PropTypes from 'prop-types';
import { DOCUMENT_COLORS } from '../../utils/documentTokens';

/**
 * Zana POS — Unified Document Design System (UDDS)
 * Printable Document Container
 *
 * Wraps in-browser printable vouchers, statements, invoices, and reports.
 * Uses `id="printable-document-area"` which connects to `@media print` isolation in `index.css`.
 *
 * Strict Isolation: Completely separate from `#pos-receipt-print-area`.
 */
export function PrintableDocumentContainer({
  title,
  subtitle,
  documentNumber,
  identity = {},
  meta = [],
  children,
  className = '',
}) {
  const businessName = (
    identity.displayName ||
    identity.organizationName ||
    'Zana POS'
  ).toUpperCase();

  const showPoweredBy = identity.showPoweredBy !== false;
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 16);

  return (
    <div
      id="printable-document-area"
      className={`bg-white text-slate-800 p-8 max-w-4xl mx-auto font-sans ${className}`}
      style={{
        minHeight: '297mm',
        boxSizing: 'border-box',
        color: DOCUMENT_COLORS.textDark,
      }}
    >
      {/* Top Brand Stripe */}
      <div
        className="w-full h-1.5 mb-6 rounded-t"
        style={{ backgroundColor: DOCUMENT_COLORS.primary }}
      />

      {/* Business Header */}
      <div className="flex justify-between items-start pb-4 border-b border-slate-200">
        <div>
          <h1
            className="text-xl font-bold tracking-tight"
            style={{ color: DOCUMENT_COLORS.primary }}
          >
            {businessName}
          </h1>

          <div className="text-xs text-slate-500 mt-1 space-y-0.5">
            {identity.address && <div>{identity.address}</div>}
            {(identity.phone || identity.email) && (
              <div>
                {identity.phone && <span>Tel: {identity.phone}</span>}
                {identity.phone && identity.email && <span className="mx-2">•</span>}
                {identity.email && <span>{identity.email}</span>}
              </div>
            )}
            {identity.kraPin && (
              <div className="font-mono text-slate-600">
                PIN: {identity.kraPin}
              </div>
            )}
          </div>
        </div>

        {/* Right Header: Title & Ref */}
        <div className="text-right">
          <div className="text-lg font-bold tracking-tight text-slate-900 uppercase">
            {title}
          </div>
          {documentNumber && (
            <div
              className="text-xs font-semibold font-mono mt-0.5"
              style={{ color: DOCUMENT_COLORS.primary }}
            >
              REF: {documentNumber}
            </div>
          )}
          {subtitle && (
            <div className="text-xs text-slate-500 mt-1">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Metadata Badges */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 py-3 border-b border-slate-100 mb-6 bg-slate-50 px-3 rounded">
        <div>
          <span>Date: <strong>{dateStr}</strong></span>
          {identity.printedBy && (
            <span className="ml-4">
              Operator: <strong>{identity.printedBy}</strong>
            </span>
          )}
        </div>

        {meta.length > 0 && (
          <div className="flex space-x-4">
            {meta.map((m, idx) => (
              <span key={idx}>
                {m.label}: <strong>{m.value}</strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main Document Content */}
      <div className="document-content my-4">
        {children}
      </div>

      {/* Running Footer */}
      <div className="mt-12 pt-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-400">
        <div>
          Generated on {dateStr}
        </div>
        <div className="text-slate-400">
          Document Output
        </div>
        {showPoweredBy && (
          <div className="font-medium text-slate-400">
            Powered by Zana POS
          </div>
        )}
      </div>
    </div>
  );
}

PrintableDocumentContainer.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  documentNumber: PropTypes.string,
  identity: PropTypes.object,
  meta: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    })
  ),
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default PrintableDocumentContainer;
