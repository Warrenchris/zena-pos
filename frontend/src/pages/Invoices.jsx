import React, { useState, useEffect, useMemo } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import LoadingSpinner from '../components/LoadingSpinner';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../components/Toast';
import axios from 'axios';
import api from '../utils/api';

const InvoiceStatusBadge = ({ status }) => {
  const getStatusColor = () => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'border border-green-500/30 text-green-400 bg-black/30';
      case 'pending':
        return 'border border-zana-borderTint text-zana-yellow bg-black/30';
      case 'overdue':
        return 'border border-red-500/30 text-red-400 bg-black/30';
      default:
        return 'border border-gray-500/30 text-gray-300 bg-black/30';
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor()}`}>
      {status}
    </span>
  );
};

const InvoiceDetailDrawer = ({ invoice, isOpen, onClose }) => {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  // Helper: fetch an image and convert to dataURL for jsPDF
  const getImageDataUrl = async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch image');
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      return null;
    }
  };

  // Generate PDF with header/footer, billing block, signature, and multi-page support
  const generatePdfDoc = async (invParam) => {
    const inv = invParam || invoice;
    if (!inv) return null;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;

    const COMPANY = {
      name: 'Zana POS',
      address: '123 Market St, Nairobi, Kenya',
      phone: '+254 700 000000',
      email: 'info@zana.example',
      reg: 'PIN: P12345678',
      paymentTerms: 'Payment due within 30 days. Late fees apply after due date.'
    };

    const logoDataUrl = await getImageDataUrl('/logo.png');

    // Header drawing function (called on every page)
    const drawHeader = () => {
      const y = margin - 10;
      if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', margin, y, 60, 60); } catch (e) { /* ignore */ }
      }
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      const titleX = logoDataUrl ? margin + 76 : margin;
      doc.text(COMPANY.name, titleX, y + 18);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(COMPANY.address, titleX, y + 34);
      doc.text(`${COMPANY.phone} • ${COMPANY.email}`, titleX, y + 48);

      // Invoice meta box on the right
      const metaX = pageWidth - margin - 200;
      doc.setFillColor(245, 245, 245);
      doc.rect(metaX, y + 6, 200, 52, 'F');
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.text(`Invoice: ${inv.invoiceNumber}`, metaX + 10, y + 22);
      doc.text(`Date: ${format(new Date(inv.dateIssued), 'PPP')}`, metaX + 10, y + 36);
      doc.text(`Status: ${inv.status}`, metaX + 10, y + 50);
    };

    // Billing / Recipient block
    const drawBillingBlock = () => {
      const startY = 110;
      doc.setFontSize(10);
      doc.text('Bill To:', margin, startY);
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text(inv.customerName || '-', margin, startY + 16);
      doc.setFont(undefined, 'normal');
      if (inv.customerAddress) doc.text(inv.customerAddress, margin, startY + 32);
      if (inv.customerPhone) doc.text(inv.customerPhone, margin, startY + 48);

      // Issuer / from block
      const fromX = pageWidth / 2;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('From:', fromX, startY);
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text(COMPANY.name, fromX, startY + 16);
      doc.setFont(undefined, 'normal');
      doc.text(COMPANY.address, fromX, startY + 32);
    };

    // Hook: draw header on first page before table
    drawHeader();
    drawBillingBlock();

    // Build table body
    const body = (inv.items || []).map(i => [i.name, String(i.quantity), formatCurrency(i.price), formatCurrency(i.quantity * i.price)]);

    // Draw items table with autoTable and ensure header on each page
    doc.autoTable({
      startY: 160,
      head: [['Item', 'Qty', 'Unit', 'Total']],
      body,
      theme: 'grid',
      styles: { fontSize: 10 },
      headStyles: { fillColor: [230, 230, 230] },
      didDrawPage: (data) => {
        // header and footer on each page
        if (doc.internal.getNumberOfPages() > 1) {
          drawHeader();
        }
        const pageNum = doc.internal.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`${COMPANY.reg}`, margin, pageHeight - 30);
        doc.text(`Page ${pageNum}`, pageWidth - margin - 40, pageHeight - 30);
      }
    });

    // Ensure totals are on the last page and not split awkwardly
    const totalsHeight = 120; // estimated block height
    const lastTableY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 160;
    if (lastTableY + totalsHeight > pageHeight - margin) {
      doc.addPage();
    }

    const totalsY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 160) + 20;
    // Draw totals box aligned to right
    const totalsX = pageWidth - margin - 220;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Subtotal:', totalsX, totalsY);
    doc.text(formatCurrency(inv.subtotal || 0), totalsX + 140, totalsY, { align: 'right' });
    doc.text('Tax:', totalsX, totalsY + 16);
    doc.text(formatCurrency(inv.tax || 0), totalsX + 140, totalsY + 16, { align: 'right' });
    if (inv.discount > 0) {
      doc.text('Discount:', totalsX, totalsY + 32);
      doc.text(`-${formatCurrency(inv.discount)}`, totalsX + 140, totalsY + 32, { align: 'right' });
    }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text('Total:', totalsX, totalsY + 56);
    doc.text(formatCurrency(inv.total || 0), totalsX + 140, totalsY + 56, { align: 'right' });

    // Payment terms under totals
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text('Payment Terms:', margin, totalsY);
    doc.text(COMPANY.paymentTerms, margin, totalsY + 14, { maxWidth: pageWidth - margin * 2 });

    // Signature area
    const sigY = totalsY + 90;
    doc.line(margin, sigY, margin + 200, sigY); // signature line
    doc.setFontSize(10);
    doc.text('Authorized signature', margin, sigY + 14);

    // Footer: company reg info centered
    const footerY = pageHeight - 18;
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${COMPANY.name} • ${COMPANY.address} • ${COMPANY.phone} • ${COMPANY.reg}`, pageWidth / 2, footerY, { align: 'center' });

    return doc;
  };

  const handleDownload = async () => {
    if (!invoice) return;
    try {
      const doc = await generatePdfDoc();
      doc.save(`${invoice.invoiceNumber || 'invoice'}.pdf`);
    } catch (err) {
      console.error('Failed to save PDF', err);
      showToast('error', 'Failed to generate invoice PDF');
    }
  };

  const handlePrint = async () => {
    if (!invoice) return;
    try {
      const doc = await generatePdfDoc();
      doc.output('dataurlnewwindow');
    } catch (err) {
      console.error('Failed to open PDF for printing', err);
      showToast('error', 'Failed to open invoice for printing');
    }
  };

  // Row-level actions
  const handleRowDownload = async (inv, e) => {
    e.stopPropagation();
    if (!inv) return;
    try {
      const doc = await generatePdfDoc(inv);
      doc.save(`${inv.invoiceNumber || 'invoice'}.pdf`);
    } catch (err) {
      console.error('Failed to save PDF', err);
      showToast('error', 'Failed to generate invoice PDF');
    }
  };

  const handleRowPrint = async (inv, e) => {
    e.stopPropagation();
    if (!inv) return;
    try {
      const doc = await generatePdfDoc(inv);
      doc.output('dataurlnewwindow');
    } catch (err) {
      console.error('Failed to open PDF for printing', err);
      showToast('error', 'Failed to open invoice for printing');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 overflow-hidden z-50">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
          <div className="pointer-events-auto w-screen max-w-md">
            <div className="flex h-full flex-col overflow-y-scroll bg-brand-black shadow-zana border-l border-zana-borderTint">
              <div className="px-4 py-6 sm:px-6 bg-black border-b border-zana-borderTint">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-zana-yellow">Invoice Details</h2>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={handlePrint}
                      className="rounded p-2 hover:bg-zana-yellow/10 text-zana-yellow"
                      title="Open PDF (print from browser)"
                    >
                      <PrinterIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={handleDownload}
                      className="rounded p-2 hover:bg-zana-yellow/10 text-zana-yellow"
                      title="Download PDF"
                    >
                      <ArrowDownTrayIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={onClose}
                      className="rounded p-2 hover:bg-zana-yellow/10 text-zana-yellow"
                    >
                      <span className="sr-only">Close panel</span>
                      ×
                    </button>
                  </div>
                </div>
              </div>
              <div className="relative flex-1 px-4 py-6 sm:px-6 text-white">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-white">Invoice #{invoice.invoiceNumber}</h3>
                    <p className="mt-1 text-sm text-white/60">
                      Issued on {format(new Date(invoice.dateIssued), 'PPP')}
                    </p>
                  </div>

                  <div className="border-t border-zana-borderTint pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-white/60">Customer</h4>
                        <p className="mt-1 text-sm text-white">{invoice.customerName}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-white/60">Status</h4>
                        <div className="mt-1">
                          <InvoiceStatusBadge status={invoice.status} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-zana-borderTint pt-6">
                    <h4 className="text-sm font-medium text-white/60">Items</h4>
                    <div className="mt-4 space-y-4">
                      {invoice.items.map((item, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <div>
                            <p className="text-white">{item.name}</p>
                            <p className="text-white/60">{item.quantity} × {formatCurrency(item.price)}</p>
                          </div>
                          <p className="text-white">{formatCurrency(item.quantity * item.price)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-zana-borderTint pt-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <p className="text-white/60">Subtotal</p>
                        <p className="text-white">{formatCurrency(invoice.subtotal)}</p>
                      </div>
                      <div className="flex justify-between text-sm">
                        <p className="text-white/60">Tax</p>
                        <p className="text-white">{formatCurrency(invoice.tax)}</p>
                      </div>
                      {invoice.discount > 0 && (
                        <div className="flex justify-between text-sm">
                          <p className="text-white/60">Discount</p>
                          <p className="text-white">-{formatCurrency(invoice.discount)}</p>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-medium">
                        <p className="text-white">Total</p>
                        <p className="text-white">{formatCurrency(invoice.total)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-zana-borderTint pt-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-white/60">Payment Method</h4>
                        <p className="mt-1 text-sm text-white">{invoice.paymentMethod}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-white/60">Issued By</h4>
                        <p className="mt-1 text-sm text-white">{invoice.issuerName}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// === Invoice Creation Modal ===
function InvoiceCreateModal({ open, onClose, onCreated }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSale, setSelectedSale] = useState('');

  useEffect(() => {
    if (open) {
      setLoading(true);
      axios.get('/api/sales', { params: { limit: 50 } })
        .then((res) => setSales(res.data?.rows || res.data || []))
        .catch(() => setError('Could not fetch sales'))
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
  await api.createInvoice({ saleId: selectedSale });
      onCreated();
      onClose();
    } catch (err) {
      setError('Failed to create invoice: '+ (err?.response?.data?.error || err.message));
    }
    setLoading(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-brand-black p-6 rounded-xl max-w-md w-full border border-zana-yellow">
        <h2 className="text-zana-yellow text-lg font-semibold mb-3">Create New Invoice</h2>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-white mb-2">Select Sale</label>
          <select
            className="w-full rounded bg-black text-white border px-3 py-2 mb-4"
            value={selectedSale}
            onChange={(e) => setSelectedSale(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Choose sale...</option>
            {sales.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {sale.invoiceNumber || sale.id} • {sale.customerName || sale.customer?.name || 'No Name'} • {new Date(sale.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
          {error && <div className="text-red-400 mb-2">{error}</div>}
          <div className="flex gap-2 justify-end mt-4">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 rounded bg-black border text-white hover:bg-gray-900">Cancel</button>
            <button type="submit" disabled={!selectedSale || loading} className="px-4 py-2 bg-zana-yellow text-black rounded hover:bg-yellow-400">{loading ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const EmptyState = () => (
  <div className="text-center py-12">
    <div className="inline-block p-4 rounded-full bg-yellow-100 text-yellow-600 mb-4">
      <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
    <h3 className="text-lg font-medium text-gray-900">No invoices available</h3>
    <p className="mt-1 text-sm text-gray-500">
      Once sales are made, invoices will appear here.
    </p>
  </div>
);

const Invoices = () => {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();
  
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'dateIssued', direction: 'desc' });
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const itemsPerPage = 10;

  // Mock data - Replace with actual API call
  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.getInvoices();
        // Backend may return either an array or an object { invoices: [], total, ... }
        const raw = Array.isArray(res.data)
          ? res.data
          : (res.data?.invoices || res.data?.rows || []);

        // Normalizer: map common API field names to our UI/pdf shape
        const normalize = (inv) => {
          const customer = inv.customer || inv.client || {};
          const get = (keys, fallback) => {
            for (const k of keys) {
              if (inv[k] !== undefined) return inv[k];
              // nested under customer
              if (customer && customer[k] !== undefined) return customer[k];
            }
            return fallback;
          };

          const items = inv.items || inv.line_items || inv.sale_items || inv.items_list || [];
          const normalizedItems = Array.isArray(items)
            ? items.map((it) => ({
                name: it.name || it.product_name || it.title || it.item || '',
                quantity: it.quantity ?? it.qty ?? it.count ?? 1,
                price: it.price ?? it.unit_price ?? it.unitPrice ?? it.rate ?? 0,
              }))
            : [];

          const subtotal = inv.subtotal ?? inv.sub_total ?? inv.amount_subtotal ?? inv.net_amount ?? inv.net_total ?? 0;
          const tax = inv.tax ?? inv.taxes ?? inv.amount_tax ?? 0;
          const discount = inv.discount ?? inv.amount_discount ?? inv.disc ?? 0;
          const total = inv.total ?? inv.amount ?? inv.grand_total ?? inv.total_amount ?? subtotal + tax - discount;

          return {
            id: inv.id ?? inv._id ?? inv.invoice_id,
            invoiceNumber: inv.invoiceNumber || inv.invoice_no || inv.number || inv.ref || inv.invoice || '',
            customerName: get(['customerName', 'customer_name', 'name', 'fullName', 'full_name', 'client_name'], inv.customerName || inv.customer_name) || (customer.name || ''),
            customerAddress: get(['customerAddress', 'customer_address', 'billing_address', 'address'], inv.customerAddress || inv.customer_address) || customer.address || '',
            customerPhone: get(['customerPhone', 'customer_phone', 'phone', 'mobile', 'contact_phone'], inv.customerPhone || inv.customer_phone) || customer.phone || '',
            dateIssued: inv.dateIssued || inv.date_issued || inv.createdAt || inv.issued_at || inv.date || inv.created_at || new Date().toISOString(),
            status: inv.status || inv.state || inv.payment_status || 'Unknown',
            items: normalizedItems,
            subtotal: Number(subtotal) || 0,
            tax: Number(tax) || 0,
            discount: Number(discount) || 0,
            total: Number(total) || 0,
            paymentMethod: inv.paymentMethod || inv.payment_method || (inv.payment && inv.payment.method) || inv.paymentType || '',
            issuerName: inv.issuerName || inv.issuer || inv.created_by || inv.issued_by || (inv.user && inv.user.name) || '',
          };
        };

        const normalized = raw.map(normalize);
        setInvoices(normalized);
      } catch (error) {
        console.error('Error fetching invoices:', error);
        let errorMsg;
        
        if (error.code === 'ERR_NETWORK') {
          errorMsg = 'Unable to connect to the server. Please check your connection and try again.';
        } else if (error.response?.status === 404) {
          errorMsg = 'Sales data not found. The sales API endpoint may not be ready.';
        } else if (error.response?.status === 401) {
          errorMsg = 'Authentication required. Please log in again.';
        } else {
          errorMsg = error.response?.data?.message || 'Failed to fetch invoices. Please try again later.';
        }
        
        setError(errorMsg);
        showToast('error', errorMsg);
        setInvoices([]); // Reset invoices on error
        
        // If it's an authentication error, might want to redirect to login
        if (error.response?.status === 401) {
          // Consider adding a redirect to login here
        }
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  const handleRefresh = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.getInvoices();
      const raw = Array.isArray(res.data)
        ? res.data
        : (res.data?.invoices || res.data?.rows || []);
      const normalize = (inv) => {
        const customer = inv.customer || inv.client || {};
        const get = (keys, fallback) => {
          for (const k of keys) {
            if (inv[k] !== undefined) return inv[k];
            // nested under customer
            if (customer && customer[k] !== undefined) return customer[k];
          }
          return fallback;
        };

        const items = inv.items || inv.line_items || inv.sale_items || inv.items_list || [];
        const normalizedItems = Array.isArray(items)
          ? items.map((it) => ({
              name: it.name || it.product_name || it.title || it.item || '',
              quantity: it.quantity ?? it.qty ?? it.count ?? 1,
              price: it.price ?? it.unit_price ?? it.unitPrice ?? it.rate ?? 0,
            }))
          : [];

        const subtotal = inv.subtotal ?? inv.sub_total ?? inv.amount_subtotal ?? inv.net_amount ?? inv.net_total ?? 0;
        const tax = inv.tax ?? inv.taxes ?? inv.amount_tax ?? 0;
        const discount = inv.discount ?? inv.amount_discount ?? inv.disc ?? 0;
        const total = inv.total ?? inv.amount ?? inv.grand_total ?? inv.total_amount ?? subtotal + tax - discount;

        return {
          id: inv.id ?? inv._id ?? inv.invoice_id,
          invoiceNumber: inv.invoiceNumber || inv.invoice_no || inv.number || inv.ref || inv.invoice || '',
          customerName: get(['customerName', 'customer_name', 'name', 'fullName', 'full_name', 'client_name'], inv.customerName || inv.customer_name) || (customer.name || ''),
          customerAddress: get(['customerAddress', 'customer_address', 'billing_address', 'address'], inv.customerAddress || inv.customer_address) || customer.address || '',
          customerPhone: get(['customerPhone', 'customer_phone', 'phone', 'mobile', 'contact_phone'], inv.customerPhone || inv.customer_phone) || customer.phone || '',
          dateIssued: inv.dateIssued || inv.date_issued || inv.createdAt || inv.issued_at || inv.date || inv.created_at || new Date().toISOString(),
          status: inv.status || inv.state || inv.payment_status || 'Unknown',
          items: normalizedItems,
          subtotal: Number(subtotal) || 0,
          tax: Number(tax) || 0,
          discount: Number(discount) || 0,
          total: Number(total) || 0,
          paymentMethod: inv.paymentMethod || inv.payment_method || (inv.payment && inv.payment.method) || inv.paymentType || '',
          issuerName: inv.issuerName || inv.issuer || inv.created_by || inv.issued_by || (inv.user && inv.user.name) || '',
        };
      };

      const normalized = raw.map(normalize);
      setInvoices(normalized);
      showToast('success', 'Invoices refreshed');
    } catch (err) {
      setError('Failed to refresh invoices');
      showToast('error', 'Failed to refresh invoices');
    }
    setLoading(false);
  };

  // Filtered and sorted invoices
  const filteredInvoices = useMemo(() => {
    return invoices
      .filter(invoice => {
        const matchesSearch = invoice.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || invoice.status.toLowerCase() === filterStatus.toLowerCase();
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
        if (sortConfig.key === 'dateIssued') {
          return multiplier * (new Date(a.dateIssued) - new Date(b.dateIssued));
        }
        return multiplier * (a[sortConfig.key] > b[sortConfig.key] ? 1 : -1);
      });
  }, [invoices, searchTerm, filterStatus, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (key) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8 bg-brand-black text-white min-h-screen">
      {/* Header */}
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-zana-yellow flex items-center gap-3">
            Invoices
            <button
              onClick={handleRefresh}
              className="ml-3 inline-flex items-center rounded bg-zana-yellow hover:bg-yellow-400 text-black px-3 py-1 font-semibold text-sm shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-600"
              title="Refresh invoices"
            >
              <ArrowPathIcon className="h-5 w-5 mr-1" />
              Refresh
            </button>
          </h1>
          <p className="mt-2 text-sm text-white/70">
            View and manage all invoices in the system.
          </p>
        </div>
      </div>
      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-700 text-red-400 px-4 py-3 rounded flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.918-.816 1.995-1.85l.007-.15V6a2 2 0 00-1.85-1.995L19 4H5a2 2 0 00-1.995 1.85L3 6v12c0 1.054.816 1.918 1.85 1.995l.15.005zm8-8v2h-4v-2h4z" /></svg>
          <span>{error}</span>
        </div>
      )}

      {/* Filters and Search */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search invoices..."
            className="block w-full rounded-md bg-black/40 text-white placeholder:text-zana-yellow/40 border border-zana-borderTint pr-10 focus:border-zana-yellow focus:ring-zana-yellow sm:text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            <MagnifyingGlassIcon className="h-5 w-5 text-zana-yellow/50" />
          </div>
        </div>
        <div className="sm:w-48">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="block w-full rounded-md bg-black/40 text-white border border-zana-borderTint focus:border-zana-yellow focus:ring-zana-yellow sm:text-sm"
          >
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {invoices.length === 0 && !loading && !error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="p-8 rounded-full bg-yellow-200/10 border-2 border-yellow-400 mb-6">
            <svg className="h-16 w-16 text-zana-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-zana-yellow mb-2">No invoices available</h3>
          <p className="text-lg text-white/80">Once sales are made, invoices will appear here.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-col">
            <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full py-2 align-middle">
                <div className="overflow-hidden shadow-zana border border-zana-borderTint">
                  <table className="min-w-full divide-y divide-zana-borderTint">
                    <thead className="bg-black">
                      <tr>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-zana-yellow border-b border-zana-borderTint"
                          onClick={() => handleSort('invoiceNumber')}
                        >
                          Invoice #
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-zana-yellow border-b border-zana-borderTint"
                          onClick={() => handleSort('customerName')}
                        >
                          Customer
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-zana-yellow border-b border-zana-borderTint"
                          onClick={() => handleSort('dateIssued')}
                        >
                          Date
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-zana-yellow border-b border-zana-borderTint"
                          onClick={() => handleSort('status')}
                        >
                          Status
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-zana-yellow border-b border-zana-borderTint"
                          onClick={() => handleSort('total')}
                        >
                          Total
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-3.5 text-left text-sm font-semibold text-zana-yellow border-b border-zana-borderTint"
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zana-borderTint">
                      {paginatedInvoices.map((invoice) => (
                        <tr
                          key={invoice.id}
                          onClick={() => setSelectedInvoice(invoice)}
                          className="cursor-pointer odd:bg-black/30 even:bg-black/20 hover:bg-zana-yellow/5"
                        >
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white">
                            {invoice.invoiceNumber}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white">
                            {invoice.customerName}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white/60">
                            {format(new Date(invoice.dateIssued), 'PP')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <InvoiceStatusBadge status={invoice.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white">
                            {formatCurrency(invoice.total)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-white">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={(e) => handleRowPrint(invoice, e)}
                                title="Open PDF (print)"
                                className="rounded p-1 hover:bg-zana-yellow/10 text-zana-yellow"
                              >
                                <PrinterIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => handleRowDownload(invoice, e)}
                                title="Download PDF"
                                className="rounded p-1 hover:bg-zana-yellow/10 text-zana-yellow"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-md border border-zana-borderTint bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zana-yellow/10"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="relative ml-3 inline-flex items-center rounded-md border border-zana-borderTint bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zana-yellow/10"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-white/80">
                  Showing <span className="font-medium">{Math.min((currentPage - 1) * itemsPerPage + 1, filteredInvoices.length)}</span> to{' '}
                  <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredInvoices.length)}</span> of{' '}
                  <span className="font-medium">{filteredInvoices.length}</span> results
                </p>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center rounded-l-md px-2 py-2 text-white/60 ring-1 ring-inset ring-[rgba(255,214,0,0.2)] hover:bg-zana-yellow/10 focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center rounded-r-md px-2 py-2 text-white/60 ring-1 ring-inset ring-[rgba(255,214,0,0.2)] hover:bg-zana-yellow/10 focus:z-20 focus:outline-offset-0"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Invoice Detail Drawer */}
      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        isOpen={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
      <InvoiceCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleRefresh}
      />
    </div>
  );
};

export default Invoices;


