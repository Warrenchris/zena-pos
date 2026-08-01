import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  ArrowPathIcon,
  XMarkIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Spinner from '../components/ui/Spinner';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../components/Toast';
import { salesAPI } from '../services/api';
import { invoicesAPI } from '../services/api/invoices';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import { WALK_IN_CUSTOMER_NAME } from '../constants/customer';
import Modal from '../components/ui/Modal';

const getStatusVariant = (status) => {
  switch (status?.toLowerCase()) {
    case 'paid':
    case 'completed':
      return 'success';
    case 'pending':
      return 'warning';
    case 'overdue':
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
};

const InvoiceDetailDrawer = ({ invoice, isOpen, onClose, onDownload, onPrint }) => {
  const { format: formatCurrency } = useCurrency();

  const handleDownload = () => {
    if (invoice && onDownload) {
      onDownload(invoice, { stopPropagation: () => {} });
    }
  };

  const handlePrint = () => {
    if (invoice && onPrint) {
      onPrint(invoice, { stopPropagation: () => {} });
    }
  };

  if (!isOpen || !invoice) return null;

  return (
    <div className="fixed inset-0 overflow-hidden z-50">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-stone-950/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
          <div className="pointer-events-auto w-screen max-w-md">
            <div className="flex h-full flex-col overflow-y-auto bg-surface shadow-modal border-l border-border-default transition-all duration-200">
              <div className="px-6 py-5 bg-surface-2/40 border-b border-border-default flex items-center justify-between">
                <div>
                  <h2 className="text-h3 font-bold text-text-primary tracking-tight">Invoice #{invoice.invoiceNumber}</h2>
                  <p className="text-caption text-text-muted mt-0.5">
                    Issued on {invoice.dateIssued ? format(new Date(invoice.dateIssued), 'PPP') : 'N/A'}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handlePrint}
                    className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
                    title="Print PDF"
                  >
                    <PrinterIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
                    title="Download PDF"
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 p-6 space-y-6 text-text-primary">
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-surface-2/40 border border-border-default">
                  <div>
                    <h4 className="text-caption font-semibold text-text-muted uppercase tracking-wider">Customer</h4>
                    <p className="mt-1 text-body font-semibold text-text-primary">{invoice.customerName || WALK_IN_CUSTOMER_NAME}</p>
                  </div>
                  <div>
                    <h4 className="text-caption font-semibold text-text-muted uppercase tracking-wider">Status</h4>
                    <div className="mt-1">
                      <Badge variant={getStatusVariant(invoice.status)}>
                        {invoice.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-caption font-semibold text-text-muted uppercase tracking-wider mb-3">Line Items</h4>
                  <div className="space-y-2">
                    {invoice.items && invoice.items.length > 0 ? (
                      invoice.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center p-3 rounded-xl border border-border-default bg-surface-2/20 text-small">
                          <div>
                            <p className="font-semibold text-text-primary">{item.name}</p>
                            <p className="text-caption text-text-muted">{item.quantity} × {formatCurrency(item.price)}</p>
                          </div>
                          <p className="font-bold text-primary">{formatCurrency(item.quantity * item.price)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-small text-text-muted">No line items detailed</p>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-surface-2/50 border border-border-default space-y-2 text-small">
                  <div className="flex justify-between text-text-secondary">
                    <span>Subtotal</span>
                    <span>{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>Tax</span>
                    <span>{formatCurrency(invoice.tax)}</span>
                  </div>
                  {invoice.discount > 0 && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Discount</span>
                      <span className="text-danger">-{formatCurrency(invoice.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-body font-bold text-text-primary pt-2 border-t border-border-default">
                    <span>Total Amount</span>
                    <span className="text-primary">{formatCurrency(invoice.total)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-small">
                  <div>
                    <h4 className="text-caption font-semibold text-text-muted uppercase tracking-wider">Payment Method</h4>
                    <p className="mt-1 font-medium text-text-primary capitalize">{invoice.paymentMethod || 'cash'}</p>
                  </div>
                  <div>
                    <h4 className="text-caption font-semibold text-text-muted uppercase tracking-wider">Issued By</h4>
                    <p className="mt-1 font-medium text-text-primary">{invoice.issuerName || 'System Admin'}</p>
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

function InvoiceCreateModal({ open, onClose, onCreated }) {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedSale, setSelectedSale] = useState('');

  useEffect(() => {
    if (open) {
      setLoading(true);
      salesAPI.getAll({ limit: 50 })
        .then((res) => {
          const list = res.data?.sales || res.data?.rows || (Array.isArray(res.data) ? res.data : []);
          setSales(list);
        })
        .catch((err) => {
          console.error('Error fetching sales:', err);
          setError('Could not fetch sales');
        })
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await invoicesAPI.create({ saleId: selectedSale });
      onCreated();
      onClose();
    } catch (err) {
      setError('Failed to create invoice: ' + (err?.response?.data?.error || err.message));
    }
    setLoading(false);
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Create New Invoice"
      description="Select a completed sale transaction to issue a formal invoice."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-small font-semibold text-text-primary mb-1.5">Select Sale Transaction</label>
          <select
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
            value={selectedSale}
            onChange={(e) => setSelectedSale(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Choose sale transaction...</option>
            {sales.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {sale.invoiceNumber || sale.id} • {sale.customerName || sale.customer?.name || WALK_IN_CUSTOMER_NAME} • {new Date(sale.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading} disabled={!selectedSale || loading}>
            Generate Invoice
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Invoices() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();
  
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
    } catch {
      return null;
    }
  };

  const generatePdfDoc = async (inv) => {
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
      paymentTerms: 'Payment due within 30 days.'
    };

    const logoDataUrl = await getImageDataUrl('/logo.png');

    const drawHeader = () => {
      const y = margin - 10;
      if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', margin, y, 60, 60); } catch {}
      }
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      const titleX = logoDataUrl ? margin + 76 : margin;
      doc.text(COMPANY.name, titleX, y + 18);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.text(COMPANY.address, titleX, y + 34);
      doc.text(`${COMPANY.phone} • ${COMPANY.email}`, titleX, y + 48);

      const metaX = pageWidth - margin - 200;
      doc.setFillColor(245, 245, 245);
      doc.rect(metaX, y, 200, 50, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(11);
      doc.text(`INVOICE: ${inv.invoiceNumber || ''}`, metaX + 10, y + 18);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      doc.text(`Date: ${inv.dateIssued ? format(new Date(inv.dateIssued), 'dd MMM yyyy') : ''}`, metaX + 10, y + 32);

      doc.setStrokeColor(120, 68, 33);
      doc.setLineWidth(1.5);
      doc.line(margin, y + 65, pageWidth - margin, y + 65);
    };

    const drawFooter = (pageNum, totalPages) => {
      const y = pageHeight - margin + 10;
      doc.setStrokeColor(220, 220, 220);
      doc.setLineWidth(0.5);
      doc.line(margin, y - 5, pageWidth - margin, y - 5);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(COMPANY.paymentTerms, margin, y + 8);
      doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin - 50, y + 8);
    };

    drawHeader();

    const clientY = margin + 85;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('BILL TO:', margin, clientY);
    doc.setFont(undefined, 'normal');
    const customer = inv.customer || {};
    doc.text(customer.name || inv.customerName || WALK_IN_CUSTOMER_NAME, margin, clientY + 14);

    const items = inv.items || [];
    const tableBody = items.map((item, index) => [
      index + 1,
      item.name || 'Product',
      item.quantity ?? 1,
      formatCurrency(item.price ?? 0),
      formatCurrency((item.price ?? 0) * (item.quantity ?? 1))
    ]);

    doc.autoTable({
      startY: clientY + 60,
      margin: { left: margin, right: margin },
      head: [['#', 'Item', 'Qty', 'Unit Price', 'Total']],
      body: tableBody,
      headStyles: {
        fillColor: [120, 68, 33],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [50, 50, 50]
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 40, halign: 'center' },
        3: { cellWidth: 80, halign: 'right' },
        4: { cellWidth: 80, halign: 'right' }
      },
      theme: 'striped'
    });

    const finalY = doc.lastAutoTable.finalY + 25;
    const summaryX = pageWidth - margin - 180;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Subtotal:', summaryX, finalY);
    doc.text(formatCurrency(inv.subtotal || inv.total), pageWidth - margin, finalY, { align: 'right' });

    doc.text('Tax:', summaryX, finalY + 14);
    doc.text(formatCurrency(inv.tax || 0), pageWidth - margin, finalY + 14, { align: 'right' });

    const totalY = finalY + 32;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text('Total Amount Due:', summaryX, totalY);
    doc.text(formatCurrency(inv.total), pageWidth - margin, totalY, { align: 'right' });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    return doc;
  };

  const handleRowDownload = async (inv, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!inv) return;
    try {
      const doc = await generatePdfDoc(inv);
      doc.save(`${inv.invoiceNumber || 'invoice'}.pdf`);
    } catch {
      showToast('error', 'Failed to generate invoice PDF');
    }
  };

  const handleRowPrint = async (inv, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!inv) return;
    try {
      const doc = await generatePdfDoc(inv);
      doc.output('dataurlnewwindow');
    } catch {
      showToast('error', 'Failed to open invoice for printing');
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await invoicesAPI.getAll();
      const raw = Array.isArray(res.data)
        ? res.data
        : (res.data?.invoices || res.data?.rows || []);

      const normalize = (inv) => {
        const customer = inv.customer || inv.client || {};
        const items = inv.items || inv.line_items || inv.sale_items || [];
        const normalizedItems = Array.isArray(items)
          ? items.map((it) => ({
              name: it.name || it.product_name || it.title || 'Product',
              quantity: it.quantity ?? 1,
              price: it.price ?? 0,
            }))
          : [];

        const subtotal = inv.subtotal ?? inv.sub_total ?? 0;
        const tax = inv.tax ?? 0;
        const discount = inv.discount ?? 0;
        const total = inv.total ?? inv.amount ?? subtotal + tax - discount;

        return {
          id: inv.id ?? inv.invoice_id,
          invoiceNumber: inv.invoiceNumber || inv.invoice_no || inv.ref || '',
          customerName: inv.customerName || inv.customer_name || customer.name || WALK_IN_CUSTOMER_NAME,
          dateIssued: inv.dateIssued || inv.createdAt || new Date().toISOString(),
          status: inv.status || 'Paid',
          items: normalizedItems,
          subtotal: Number(subtotal) || 0,
          tax: Number(tax) || 0,
          discount: Number(discount) || 0,
          total: Number(total) || 0,
          paymentMethod: inv.paymentMethod || 'cash',
          issuerName: inv.issuerName || 'System Admin',
        };
      };

      setInvoices(raw.map(normalize));
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Failed to fetch invoices. Please check your network.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter(inv => {
        const matchesSearch = inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || inv.status.toLowerCase() === filterStatus.toLowerCase();
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

  const columns = [
    {
      key: 'invoiceNumber',
      label: 'Invoice #',
      render: (val) => <span className="font-semibold text-text-primary">{val}</span>
    },
    {
      key: 'customerName',
      label: 'Customer',
      render: (val) => <span className="text-text-primary font-medium">{val}</span>
    },
    {
      key: 'dateIssued',
      label: 'Date',
      render: (val) => <span className="text-text-secondary text-small">{val ? format(new Date(val), 'PP') : '-'}</span>
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <Badge variant={getStatusVariant(val)}>
          {val}
        </Badge>
      )
    },
    {
      key: 'total',
      label: 'Total',
      render: (val) => <span className="font-bold text-primary">{formatCurrency(val || 0)}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => handleRowPrint(row, e)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Print PDF"
          >
            <PrinterIcon className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => handleRowDownload(row, e)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Download PDF"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="View, filter, print, and export all generated retail sales invoices."
        primaryAction={{
          label: 'Create Invoice',
          icon: DocumentTextIcon,
          onClick: () => setShowCreateModal(true)
        }}
        secondaryActions={
          <Button
            variant="outline"
            size="md"
            leftIcon={ArrowPathIcon}
            onClick={fetchInvoices}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card variant="default" className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Search by customer name or invoice number..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>
          <div className="sm:w-48">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Table
        columns={columns}
        data={filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
        loading={loading}
        emptyTitle="No Invoices Found"
        emptyDescription="Once sales are completed, formal invoices will appear here."
        onSelectRow={(id) => {
          const inv = invoices.find(i => i.id === id);
          if (inv) setSelectedInvoice(inv);
        }}
        pagination={{
          currentPage,
          totalPages: Math.ceil(filteredInvoices.length / itemsPerPage) || 1,
          totalItems: filteredInvoices.length,
          pageSize: itemsPerPage,
          onPageChange: (p) => setCurrentPage(p)
        }}
      />

      {/* Invoice Detail Drawer */}
      <InvoiceDetailDrawer
        invoice={selectedInvoice}
        isOpen={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        onDownload={handleRowDownload}
        onPrint={handleRowPrint}
      />

      {/* Create Modal */}
      <InvoiceCreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchInvoices}
      />
    </div>
  );
}
