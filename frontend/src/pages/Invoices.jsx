import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import LoadingSpinner from '../components/LoadingSpinner';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../hooks/useToast';

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
                      onClick={() => {/* TODO: Implement print */}}
                      className="rounded p-2 hover:bg-zana-yellow/10 text-zana-yellow"
                    >
                      <PrinterIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {/* TODO: Implement download */}}
                      className="rounded p-2 hover:bg-zana-yellow/10 text-zana-yellow"
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
  const dispatch = useDispatch();
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();
  
  // State
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: 'dateIssued', direction: 'desc' });
  const [filterStatus, setFilterStatus] = useState('all');
  
  const itemsPerPage = 10;

  // Mock data - Replace with actual API call
  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual API call
        const mockData = [
          {
            id: 1,
            invoiceNumber: 'INV-001',
            customerName: 'John Doe',
            dateIssued: '2025-10-28',
            status: 'Paid',
            total: 1250.00,
            subtotal: 1000.00,
            tax: 250.00,
            discount: 0,
            paymentMethod: 'M-Pesa',
            issuerName: 'Jane Smith',
            items: [
              { name: 'Product 1', quantity: 2, price: 300 },
              { name: 'Product 2', quantity: 1, price: 400 },
            ]
          },
          // Add more mock data as needed
        ];
        setInvoices(mockData);
      } catch (error) {
        showToast('error', 'Failed to fetch invoices');
        console.error('Error fetching invoices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, []);

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
          <h1 className="text-2xl font-semibold text-zana-yellow">Invoices</h1>
          <p className="mt-2 text-sm text-white/70">
            View and manage all invoices in the system.
          </p>
        </div>
      </div>

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
      {invoices.length === 0 ? (
        <EmptyState />
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
    </div>
  );
};

export default Invoices;


