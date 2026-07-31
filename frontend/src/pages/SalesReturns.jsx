import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ArrowUturnLeftIcon,
  EyeIcon,
  PlusIcon,
  FunnelIcon,
  CurrencyDollarIcon,
  DocumentCheckIcon,
  CheckCircleIcon,
  ShoppingBagIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../components/Toast';
import { salesAPI } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

const getMethodVariant = (method) => {
  switch (method?.toLowerCase()) {
    case 'cash':
      return 'success';
    case 'card':
      return 'primary';
    case 'mobile_money':
    case 'mobile':
      return 'warning';
    case 'store_credit':
      return 'secondary';
    default:
      return 'neutral';
  }
};

const formatMethodLabel = (method) => {
  switch (method?.toLowerCase()) {
    case 'mobile_money':
    case 'mobile':
      return 'Mobile Money';
    case 'store_credit':
      return 'Store Credit';
    case 'card':
      return 'Card Payment';
    case 'cash':
      return 'Cash';
    default:
      return method || 'Cash';
  }
};

export default function SalesReturns() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Process Return Modal State
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [salesList, setSalesList] = useState([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [selectedSaleDetails, setSelectedSaleDetails] = useState(null);
  const [loadingSaleDetails, setLoadingSaleDetails] = useState(false);
  const [returnItemsState, setReturnItemsState] = useState({});
  const [refundMethod, setRefundMethod] = useState('cash');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [modalError, setModalError] = useState('');

  // Details Modal State
  const [selectedReturn, setSelectedReturn] = useState(null);

  // Fetch Returns
  const fetchReturns = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await salesAPI.getAllReturns();
      setReturns(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to fetch sales returns:', err);
      setError('Could not load sales returns. Please refresh.');
      setReturns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  // Fetch Sales when opening process modal
  useEffect(() => {
    if (showProcessModal) {
      setLoadingSales(true);
      setModalError('');
      salesAPI.getAll({ limit: 50 })
        .then((res) => {
          const list = res.data?.sales || res.data?.rows || (Array.isArray(res.data) ? res.data : []);
          setSalesList(list);
        })
        .catch((err) => {
          console.error('Error fetching sales for return:', err);
          setModalError('Failed to fetch past sales');
        })
        .finally(() => setLoadingSales(false));
    } else {
      setSelectedSaleId('');
      setSelectedSaleDetails(null);
      setReturnItemsState({});
      setModalError('');
    }
  }, [showProcessModal]);

  // When a sale is selected in process return modal, load its details
  useEffect(() => {
    if (!selectedSaleId) {
      setSelectedSaleDetails(null);
      setReturnItemsState({});
      return;
    }

    setLoadingSaleDetails(true);
    setModalError('');

    Promise.all([
      salesAPI.getById(selectedSaleId),
      salesAPI.getRefunds(selectedSaleId).catch(() => ({ data: [] }))
    ])
      .then(([saleRes, refundsRes]) => {
        const sale = saleRes.data;
        const pastRefunds = Array.isArray(refundsRes.data) ? refundsRes.data : [];

        // Calculate already refunded quantities per productId
        const refundedQtyMap = {};
        pastRefunds.forEach(rf => {
          refundedQtyMap[rf.productId] = (refundedQtyMap[rf.productId] || 0) + (rf.quantity || 0);
        });

        setSelectedSaleDetails({ ...sale, pastRefunds });
        
        // Default return method to sale's payment method
        setRefundMethod(sale.paymentMethod || 'cash');

        // Initialize return item states
        const initialItems = {};
        const items = sale.items || sale.SaleItems || [];
        items.forEach(it => {
          const alreadyRefunded = refundedQtyMap[it.productId] || 0;
          const availableQty = Math.max(0, (it.quantity || 1) - alreadyRefunded);
          initialItems[it.productId] = {
            productId: it.productId,
            name: it.product?.name || it.name || `Product #${it.productId}`,
            unitPrice: Number(it.price || it.unitPrice || it.originalPrice || 0),
            purchasedQty: it.quantity || 1,
            alreadyRefunded,
            availableQty,
            returnQty: 0,
            reasonPreset: 'Defective / Damaged',
            customReason: ''
          };
        });
        setReturnItemsState(initialItems);
      })
      .catch((err) => {
        console.error('Error loading sale details:', err);
        setModalError('Failed to load sale details');
      })
      .finally(() => setLoadingSaleDetails(false));
  }, [selectedSaleId]);

  // Calculate return totals
  const totalReturnAmount = useMemo(() => {
    return Object.values(returnItemsState).reduce((sum, item) => {
      const qty = Number(item.returnQty) || 0;
      return sum + (qty * (item.unitPrice || 0));
    }, 0);
  }, [returnItemsState]);

  const totalReturnQuantity = useMemo(() => {
    return Object.values(returnItemsState).reduce((sum, item) => {
      return sum + (Number(item.returnQty) || 0);
    }, 0);
  }, [returnItemsState]);

  // Filtered Returns
  const filteredReturns = useMemo(() => {
    return returns.filter(ret => {
      const matchSearch =
        String(ret.id).includes(searchTerm) ||
        (ret.sale?.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ret.sale?.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ret.product?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (ret.reason || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchMethod =
        filterMethod === 'all' ||
        ret.refundMethod?.toLowerCase() === filterMethod.toLowerCase();

      return matchSearch && matchMethod;
    });
  }, [returns, searchTerm, filterMethod]);

  // Stats Summary
  const stats = useMemo(() => {
    const totalCount = returns.length;
    const totalAmount = returns.reduce((sum, r) => sum + (Number(r.amount || r.refundAmount) || 0), 0);
    const totalItems = returns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const uniqueSales = new Set(returns.map(r => r.saleId)).size;

    return { totalCount, totalAmount, totalItems, uniqueSales };
  }, [returns]);

  // Handle Submit Process Return
  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    setModalError('');

    const itemsToSubmit = Object.values(returnItemsState)
      .filter(item => Number(item.returnQty) > 0)
      .map(item => ({
        productId: item.productId,
        quantity: Number(item.returnQty),
        reason: item.reasonPreset === 'Other' ? (item.customReason || 'Customer Return') : item.reasonPreset
      }));

    if (itemsToSubmit.length === 0) {
      setModalError('Please select at least 1 item quantity to return.');
      return;
    }

    try {
      setSubmittingRefund(true);
      await salesAPI.processRefund(selectedSaleId, {
        items: itemsToSubmit,
        refundMethod
      });

      showToast('success', 'Return processed successfully and inventory updated!');
      setShowProcessModal(false);
      fetchReturns();
    } catch (err) {
      console.error('Error processing refund:', err);
      setModalError(err?.response?.data?.error || err.message || 'Failed to process return');
    } finally {
      setSubmittingRefund(false);
    }
  };

  // Table Columns
  const columns = [
    {
      key: 'id',
      label: 'Return #',
      render: (val) => <span className="font-semibold text-text-primary">RET-{String(val).padStart(4, '0')}</span>
    },
    {
      key: 'refundedAt',
      label: 'Date & Time',
      render: (val) => (
        <span className="text-text-secondary text-small">
          {val ? format(new Date(val), 'MMM d, yyyy • h:mm a') : '-'}
        </span>
      )
    },
    {
      key: 'sale',
      label: 'Invoice / Sale #',
      render: (_, row) => (
        <div>
          <p className="font-semibold text-text-primary">{row.sale?.invoiceNumber || `#${row.saleId}`}</p>
          <p className="text-caption text-text-muted">{row.sale?.customerName || 'Walk-in Customer'}</p>
        </div>
      )
    },
    {
      key: 'product',
      label: 'Product Returned',
      render: (_, row) => (
        <div>
          <p className="font-medium text-text-primary">{row.product?.name || `Product #${row.productId}`}</p>
          <p className="text-caption text-text-muted">Qty: <span className="font-bold text-text-primary">{row.quantity}</span></p>
        </div>
      )
    },
    {
      key: 'amount',
      label: 'Refund Amount',
      render: (_, row) => (
        <span className="font-bold text-danger">
          {formatCurrency(row.refundAmount || row.amount || 0)}
        </span>
      )
    },
    {
      key: 'refundMethod',
      label: 'Method',
      render: (val) => (
        <Badge variant={getMethodVariant(val)}>
          {formatMethodLabel(val)}
        </Badge>
      )
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (val) => <span className="text-small text-text-secondary truncate max-w-xs">{val || 'Customer Return'}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <button
          onClick={() => setSelectedReturn(row)}
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
          title="View Return Details"
        >
          <EyeIcon className="h-4 w-4" />
        </button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Returns & Refunds"
        description="Manage customer returns, issue partial/full item refunds, and auto-restock inventory."
        primaryAction={{
          label: 'Process New Return',
          icon: PlusIcon,
          onClick: () => setShowProcessModal(true)
        }}
        secondaryActions={
          <Button
            variant="outline"
            size="md"
            leftIcon={ArrowPathIcon}
            onClick={fetchReturns}
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-danger/10 text-danger">
            <ArrowUturnLeftIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Total Returns</p>
            <p className="text-h2 font-bold text-text-primary">{stats.totalCount}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-warning/10 text-warning">
            <CurrencyDollarIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Total Refunded</p>
            <p className="text-h2 font-bold text-text-primary">{formatCurrency(stats.totalAmount)}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <ShoppingBagIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Items Restocked</p>
            <p className="text-h2 font-bold text-text-primary">{stats.totalItems}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-success/10 text-success">
            <DocumentCheckIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Sales Affected</p>
            <p className="text-h2 font-bold text-text-primary">{stats.uniqueSales}</p>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card variant="default" className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Search by return ID, invoice #, customer name, product, or reason..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>
          <div className="sm:w-56">
            <select
              value={filterMethod}
              onChange={(e) => {
                setFilterMethod(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Refund Methods</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="store_credit">Store Credit</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Returns Table */}
      <Table
        columns={columns}
        data={filteredReturns.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
        loading={loading}
        emptyTitle="No Sales Returns Found"
        emptyDescription="When customer returns or refunds are processed, they will be tracked here."
        onSelectRow={(id) => {
          const item = returns.find(r => r.id === id);
          if (item) setSelectedReturn(item);
        }}
        pagination={{
          currentPage,
          totalPages: Math.ceil(filteredReturns.length / itemsPerPage) || 1,
          totalItems: filteredReturns.length,
          pageSize: itemsPerPage,
          onPageChange: (p) => setCurrentPage(p)
        }}
      />

      {/* Process Return Modal */}
      <Modal
        isOpen={showProcessModal}
        onClose={() => setShowProcessModal(false)}
        title="Process Customer Return"
        description="Select a completed sale, choose items and quantities to return, and issue a refund."
      >
        <form onSubmit={handleSubmitReturn} className="space-y-5">
          {modalError && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
              {modalError}
            </div>
          )}

          {/* Step 1: Select Sale */}
          <div>
            <label className="block text-small font-semibold text-text-primary mb-1.5">
              1. Select Completed Sale Transaction
            </label>
            {loadingSales ? (
              <div className="flex items-center space-x-2 text-small text-text-muted p-2">
                <Spinner size="sm" />
                <span>Loading completed sales...</span>
              </div>
            ) : (
              <select
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
                value={selectedSaleId}
                onChange={(e) => setSelectedSaleId(e.target.value)}
                required
                disabled={submittingRefund}
              >
                <option value="">Choose a sale to return...</option>
                {salesList.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.invoiceNumber || `#${sale.id}`} • {sale.customerName || sale.customer?.name || 'Walk-in'} • Total: {formatCurrency(sale.total)} • {new Date(sale.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Step 2: Sale Items & Quantities to Return */}
          {selectedSaleId && (
            loadingSaleDetails ? (
              <div className="py-6 text-center text-text-muted">
                <Spinner size="md" className="mx-auto mb-2" />
                <p className="text-small">Loading sale line items...</p>
              </div>
            ) : selectedSaleDetails && (
              <div className="space-y-4 pt-2 border-t border-border-default">
                <div className="flex justify-between items-center">
                  <h4 className="text-small font-bold text-text-primary uppercase tracking-wider">
                    2. Select Line Items to Refund
                  </h4>
                  <Badge variant="neutral">
                    {selectedSaleDetails.invoiceNumber || `#${selectedSaleDetails.id}`}
                  </Badge>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {Object.values(returnItemsState).map((item) => (
                    <div
                      key={item.productId}
                      className="p-3.5 rounded-xl border border-border-default bg-surface-2/30 space-y-2.5 text-small"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-text-primary">{item.name}</p>
                          <p className="text-caption text-text-muted">
                            Unit Price: <span className="font-medium text-text-primary">{formatCurrency(item.unitPrice)}</span> • Purchased: {item.purchasedQty} • Prev. Refunded: {item.alreadyRefunded}
                          </p>
                        </div>
                        <Badge variant={item.availableQty > 0 ? 'success' : 'neutral'}>
                          {item.availableQty} available
                        </Badge>
                      </div>

                      {item.availableQty > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-caption text-text-muted mb-1 font-semibold">Qty to Return</label>
                            <input
                              type="number"
                              min="0"
                              max={item.availableQty}
                              value={item.returnQty}
                              onChange={(e) => {
                                const val = Math.min(item.availableQty, Math.max(0, parseInt(e.target.value) || 0));
                                setReturnItemsState(prev => ({
                                  ...prev,
                                  [item.productId]: { ...prev[item.productId], returnQty: val }
                                }));
                              }}
                              className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-default text-text-primary text-small focus:ring-2 focus:ring-primary/30 font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-caption text-text-muted mb-1 font-semibold">Return Reason</label>
                            <select
                              value={item.reasonPreset}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReturnItemsState(prev => ({
                                  ...prev,
                                  [item.productId]: { ...prev[item.productId], reasonPreset: val }
                                }));
                              }}
                              className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-default text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                            >
                              <option value="Defective / Damaged">Defective / Damaged</option>
                              <option value="Wrong Item Delivered">Wrong Item Delivered</option>
                              <option value="Customer Changed Mind">Customer Changed Mind</option>
                              <option value="Quality Issue">Quality Issue</option>
                              <option value="Other">Other Reason...</option>
                            </select>
                          </div>

                          {item.reasonPreset === 'Other' && (
                            <div className="sm:col-span-2">
                              <input
                                type="text"
                                placeholder="Enter specific return reason..."
                                value={item.customReason}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setReturnItemsState(prev => ({
                                    ...prev,
                                    [item.productId]: { ...prev[item.productId], customReason: val }
                                  }));
                                }}
                                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-default text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-caption text-text-muted italic">All purchased units of this item have already been refunded.</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Step 3: Refund Method & Summary */}
                <div className="pt-3 border-t border-border-default space-y-3">
                  <div>
                    <label className="block text-small font-semibold text-text-primary mb-1.5">
                      3. Issue Refund Via
                    </label>
                    <select
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="card">Card Payment</option>
                      <option value="store_credit">Store Credit</option>
                    </select>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-2/60 border border-border-default flex justify-between items-center">
                    <div>
                      <p className="text-caption font-semibold text-text-muted uppercase">Total Items to Return</p>
                      <p className="text-body font-bold text-text-primary">{totalReturnQuantity} units</p>
                    </div>
                    <div className="text-right">
                      <p className="text-caption font-semibold text-text-muted uppercase">Total Refund Amount</p>
                      <p className="text-h3 font-bold text-danger">{formatCurrency(totalReturnAmount)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}

          <div className="flex gap-3 justify-end pt-3 border-t border-border-default">
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowProcessModal(false)}
              disabled={submittingRefund}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={submittingRefund}
              disabled={!selectedSaleId || totalReturnQuantity === 0 || submittingRefund}
            >
              Process Refund & Restock
            </Button>
          </div>
        </form>
      </Modal>

      {/* Return Detail Modal */}
      {selectedReturn && (
        <Modal
          isOpen={Boolean(selectedReturn)}
          onClose={() => setSelectedReturn(null)}
          title={`Sales Return Details (RET-${String(selectedReturn.id).padStart(4, '0')})`}
          description="Detailed breakdown of processed return and inventory adjustment."
        >
          <div className="space-y-5 text-text-primary">
            <div className="p-4 rounded-xl bg-surface-2/40 border border-border-default grid grid-cols-2 gap-4 text-small">
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase">Sale / Invoice #</p>
                <p className="text-body font-bold text-text-primary">{selectedReturn.sale?.invoiceNumber || `#${selectedReturn.saleId}`}</p>
              </div>
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase">Customer</p>
                <p className="text-body font-semibold text-text-primary">{selectedReturn.sale?.customerName || 'Walk-in Customer'}</p>
              </div>
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase">Processed Date</p>
                <p className="text-small text-text-primary">
                  {selectedReturn.refundedAt ? format(new Date(selectedReturn.refundedAt), 'PPP • p') : '-'}
                </p>
              </div>
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase">Processed By</p>
                <p className="text-small text-text-primary">{selectedReturn.refunderName || 'System Admin'}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-border-default space-y-3">
              <h4 className="text-caption font-bold text-text-muted uppercase tracking-wider">Item Returned</h4>
              <div className="flex justify-between items-center text-body font-medium">
                <div>
                  <p className="font-bold text-text-primary">{selectedReturn.product?.name || `Product #${selectedReturn.productId}`}</p>
                  <p className="text-caption text-text-muted">Quantity Returned: <span className="font-bold text-text-primary">{selectedReturn.quantity}</span></p>
                </div>
                <div className="text-right">
                  <p className="text-caption font-semibold text-text-muted uppercase">Amount Refunded</p>
                  <p className="text-h3 font-bold text-danger">{formatCurrency(selectedReturn.refundAmount || selectedReturn.amount || 0)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-small">
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase mb-1">Refund Method</p>
                <Badge variant={getMethodVariant(selectedReturn.refundMethod)}>
                  {formatMethodLabel(selectedReturn.refundMethod)}
                </Badge>
              </div>
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase mb-1">Return Reason</p>
                <p className="text-small font-medium text-text-primary">{selectedReturn.reason || 'Customer Return'}</p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-border-default">
              <Button variant="outline" onClick={() => setSelectedReturn(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
