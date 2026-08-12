import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
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
  XMarkIcon,
  PrinterIcon,
  ShieldExclamationIcon,
  DocumentTextIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../components/Toast';
import { salesAPI, employeesAPI } from '../services/api';
import { WALK_IN_CUSTOMER_NAME } from '../constants/customer';
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

const formatDisposition = (disposition) => {
  switch (disposition) {
    case 'restock':
      return { label: 'Restocked', variant: 'success' };
    case 'damaged_writeoff':
      return { label: 'Damaged Write-Off', variant: 'danger' };
    case 'return_to_supplier':
      return { label: 'Supplier Return', variant: 'warning' };
    default:
      return { label: disposition || 'Restocked', variant: 'neutral' };
  }
};

const formatReasonCode = (code) => {
  switch (code) {
    case 'DEFECTIVE': return 'Defective / Damaged';
    case 'WRONG_ITEM': return 'Wrong Item';
    case 'EXPIRED': return 'Expired';
    case 'CHANGED_MIND': return 'Changed Mind';
    case 'OTHER': return 'Other';
    default: return code || 'Customer Return';
  }
};

export default function SalesReturns() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();
  const { user } = useSelector((state) => state.auth || {});

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

  // Priority 2: Manager Approval Modal State
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [managersList, setManagersList] = useState([]);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [managerModalError, setManagerModalError] = useState('');

  // Priority 3: Non-Returnable & Return Window Admin Override State
  const [adminOverrideActive, setAdminOverrideActive] = useState(false);
  const [showOverrideOption, setShowOverrideOption] = useState(false);

  // Priority 5: Credit Note View State
  const [creditNoteData, setCreditNoteData] = useState(null);
  const [loadingCreditNote, setLoadingCreditNote] = useState(false);

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
      setShowOverrideOption(false);
      setAdminOverrideActive(false);
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
      setShowOverrideOption(false);
      setAdminOverrideActive(false);
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
    setShowOverrideOption(false);
    setAdminOverrideActive(false);

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

        // Initialize return item states (Default disposition is empty string to force deliberate choice!)
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
            disposition: '', // PRIORITY 1: Default to unselected/empty
            reasonCode: 'DEFECTIVE', // PRIORITY 4: Standard backend ENUM
            reasonNotes: ''
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
        (ret.reason || ret.reasonCode || '').toLowerCase().includes(searchTerm.toLowerCase());

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

  // Fetch eligible managers for Priority 2 threshold approval
  const fetchEligibleManagers = async () => {
    try {
      const res = await employeesAPI.getAll();
      const list = Array.isArray(res.data) ? res.data : (res.data?.employees || []);
      const managers = list.filter(e => e.role === 'manager' || e.role === 'admin');
      setManagersList(managers);
      if (managers.length > 0) {
        setSelectedManagerId(String(managers[0].id));
      }
    } catch (err) {
      console.error('Failed to fetch managers:', err);
    }
  };

  // Internal execution of processRefund call
  const executeProcessRefund = async (overrideManagerId = null) => {
    const activeItems = Object.values(returnItemsState).filter(item => Number(item.returnQty) > 0);

    const payloadItems = activeItems.map(item => ({
      productId: item.productId,
      quantity: Number(item.returnQty),
      disposition: item.disposition, // PRIORITY 1: Included disposition
      reasonCode: item.reasonCode || 'OTHER', // PRIORITY 4: Backend ENUM
      reasonNotes: item.reasonNotes || ''
    }));

    const payload = {
      items: payloadItems,
      refundMethod,
      managerApprovalId: overrideManagerId || undefined,
      adminOverride: adminOverrideActive || undefined
    };

    setSubmittingRefund(true);

    try {
      await salesAPI.processRefund(selectedSaleId, payload);

      showToast('success', 'Return processed successfully and inventory updated!');
      setShowProcessModal(false);
      setShowManagerModal(false);
      fetchReturns();
    } catch (err) {
      console.error('Error processing refund:', err);
      const status = err?.response?.status;
      const errorMsg = err?.response?.data?.error || err.message || '';

      const isThresholdExceeded = status === 403 && (
        errorMsg.toLowerCase().includes('threshold') ||
        errorMsg.toLowerCase().includes('manager approval') ||
        errorMsg.toLowerCase().includes('unapproved')
      );

      const isPolicyBlocked = status === 400 && (
        errorMsg.toLowerCase().includes('non-returnable') ||
        errorMsg.toLowerCase().includes('return window')
      );

      if (isThresholdExceeded) {
        setModalError('');
        setShowManagerModal(true);
        fetchEligibleManagers();
      } else if (isPolicyBlocked) {
        setModalError(`Policy Restriction: ${errorMsg}`);
        setShowOverrideOption(true);
      } else {
        setModalError(errorMsg || 'Failed to process return');
      }
    } finally {
      setSubmittingRefund(false);
    }
  };

  // Priority 1: Handle Submit Process Return with Disposition Validation
  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    setModalError('');

    const activeItems = Object.values(returnItemsState).filter(item => Number(item.returnQty) > 0);

    if (activeItems.length === 0) {
      setModalError('Please select at least 1 item quantity to return.');
      return;
    }

    // PRIORITY 1: Validate disposition for all returned items
    const missingDisposition = activeItems.some(item => !item.disposition);
    if (missingDisposition) {
      setModalError('Please select a disposition (Restock, Damaged Write-off, or Supplier Return) for all items being returned.');
      return;
    }

    await executeProcessRefund();
  };

  // Priority 2: Confirm Manager Auth in Modal
  const handleConfirmManagerApproval = async (e) => {
    e.preventDefault();
    if (!selectedManagerId) {
      setManagerModalError('Please select or authenticate a manager.');
      return;
    }
    setManagerModalError('');
    await executeProcessRefund(selectedManagerId);
  };

  // Priority 5: View Credit Note
  const handleFetchCreditNote = async (saleId) => {
    try {
      setLoadingCreditNote(true);
      const res = await salesAPI.getCreditNote(saleId);
      setCreditNoteData(res.data);
    } catch (err) {
      console.error('Failed to load credit note:', err);
      showToast('error', err?.response?.data?.error || 'Could not load credit note details');
    } finally {
      setLoadingCreditNote(false);
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
          <p className="text-caption text-text-muted">{row.sale?.Customer?.name || row.sale?.customer?.name || row.sale?.customerName || WALK_IN_CUSTOMER_NAME}</p>
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
      key: 'disposition',
      label: 'Disposition',
      render: (val) => {
        const disp = formatDisposition(val);
        return <Badge variant={disp.variant}>{disp.label}</Badge>;
      }
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
      key: 'reasonCode',
      label: 'Reason & Notes',
      render: (_, row) => (
        <div>
          <span className="text-small font-semibold text-text-primary">{formatReasonCode(row.reasonCode || row.reason)}</span>
          {row.reasonNotes && <p className="text-caption text-text-muted truncate max-w-xs">{row.reasonNotes}</p>}
          {row.managerApprovalId && (
            <span className="inline-flex items-center gap-1 text-caption text-success font-medium mt-0.5">
              <CheckBadgeIcon className="h-3.5 w-3.5" /> Approved by Manager
            </span>
          )}
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSelectedReturn(row)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="View Return Details"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleFetchCreditNote(row.saleId)}
            className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
            title="View Credit Note"
          >
            <DocumentTextIcon className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Returns & Refunds"
        description="Manage customer returns, issue partial/full item refunds, and track restock vs damaged write-offs."
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
            <p className="text-caption font-semibold text-text-muted uppercase">Items Returned</p>
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
        description="Select a completed sale, specify returned items, disposition, and reason code."
      >
        <form onSubmit={handleSubmitReturn} className="space-y-5">
          {modalError && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
              {modalError}
            </div>
          )}

          {/* Priority 3: Admin Override Notice */}
          {showOverrideOption && (user?.role === 'admin' || user?.role === 'manager') && (
            <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 space-y-2">
              <div className="flex items-center space-x-2 text-warning font-semibold text-small">
                <ShieldExclamationIcon className="h-5 w-5" />
                <span>Policy Restriction Active — Admin Override Available</span>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer text-small text-text-primary">
                <input
                  type="checkbox"
                  checked={adminOverrideActive}
                  onChange={(e) => setAdminOverrideActive(e.target.checked)}
                  className="rounded border-border-default text-primary focus:ring-primary h-4 w-4"
                />
                <span className="font-semibold">Enable Admin Override (Bypass non-returnable & return window rules)</span>
              </label>
              {adminOverrideActive && (
                <p className="text-caption text-warning italic">
                  Note: Using Admin Override will log an official policy override in system audit trails.
                </p>
              )}
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
                    {sale.invoiceNumber || `#${sale.id}`} • {sale.Customer?.name || sale.customer?.name || sale.customerName || WALK_IN_CUSTOMER_NAME} • Total: {formatCurrency(sale.total)} • {new Date(sale.createdAt).toLocaleDateString()}
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
                    2. Select Line Items, Disposition & Reason
                  </h4>
                  <Badge variant="neutral">
                    {selectedSaleDetails.invoiceNumber || `#${selectedSaleDetails.id}`}
                  </Badge>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {Object.values(returnItemsState).map((item) => (
                    <div
                      key={item.productId}
                      className="p-3.5 rounded-xl border border-border-default bg-surface-2/30 space-y-3 text-small"
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                          {/* Qty to Return */}
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

                          {/* Priority 1: Disposition Selector (Unselected by Default) */}
                          <div>
                            <label className="block text-caption text-text-muted mb-1 font-semibold">
                              Item Disposition <span className="text-danger">*</span>
                            </label>
                            <select
                              value={item.disposition}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReturnItemsState(prev => ({
                                  ...prev,
                                  [item.productId]: { ...prev[item.productId], disposition: val }
                                }));
                              }}
                              className={`w-full px-3 py-1.5 rounded-lg bg-surface border ${
                                item.returnQty > 0 && !item.disposition ? 'border-danger ring-1 ring-danger/40' : 'border-border-default'
                              } text-text-primary text-small focus:ring-2 focus:ring-primary/30`}
                              disabled={item.returnQty === 0}
                            >
                              <option value="">-- Choose Disposition --</option>
                              <option value="restock">Restock — Return to Sellable Stock</option>
                              <option value="damaged_writeoff">Damaged — Inventory Write-Off</option>
                              <option value="return_to_supplier">Return to Supplier</option>
                            </select>
                          </div>

                          {/* Priority 4: Reason Code Selector */}
                          <div>
                            <label className="block text-caption text-text-muted mb-1 font-semibold">Reason Code</label>
                            <select
                              value={item.reasonCode}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReturnItemsState(prev => ({
                                  ...prev,
                                  [item.productId]: { ...prev[item.productId], reasonCode: val }
                                }));
                              }}
                              className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border-default text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                              disabled={item.returnQty === 0}
                            >
                              <option value="DEFECTIVE">Defective / Damaged</option>
                              <option value="WRONG_ITEM">Wrong Item Delivered</option>
                              <option value="EXPIRED">Expired Product</option>
                              <option value="CHANGED_MIND">Customer Changed Mind</option>
                              <option value="OTHER">Other Reason...</option>
                            </select>
                          </div>

                          {/* Priority 4: Free-text Reason Notes */}
                          {item.returnQty > 0 && (
                            <div className="sm:col-span-3">
                              <input
                                type="text"
                                placeholder="Optional reason notes / additional details..."
                                value={item.reasonNotes}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setReturnItemsState(prev => ({
                                    ...prev,
                                    [item.productId]: { ...prev[item.productId], reasonNotes: val }
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
              Process Refund
            </Button>
          </div>
        </form>
      </Modal>

      {/* Priority 2: Manager Approval Modal */}
      <Modal
        isOpen={showManagerModal}
        onClose={() => {
          setShowManagerModal(false);
          setModalError('Manager approval required to proceed with refunds over threshold (5,000 KSh).');
        }}
        title="Manager Approval Required"
        description="This refund total exceeds the unapproved threshold (5,000 KSh). Select or authenticate an authorized manager."
      >
        <form onSubmit={handleConfirmManagerApproval} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 flex items-center space-x-3 text-warning text-small">
            <ShieldExclamationIcon className="h-6 w-6 flex-shrink-0" />
            <div>
              <p className="font-bold">High Value Refund Authorization</p>
              <p className="text-caption">Manager approval is required to approve refunds over 5,000 KSh.</p>
            </div>
          </div>

          {managerModalError && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-small">
              {managerModalError}
            </div>
          )}

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1.5">
              Select Authorizing Manager
            </label>
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30 font-semibold"
              required
            >
              <option value="">Select Manager...</option>
              {managersList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email} ({m.role.toUpperCase()}) — ID #{m.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t border-border-default">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setShowManagerModal(false);
                setModalError('Manager approval required to proceed with refunds over threshold.');
              }}
            >
              Cancel Refund
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={submittingRefund}
              disabled={!selectedManagerId || submittingRefund}
            >
              Authorize & Process Refund
            </Button>
          </div>
        </form>
      </Modal>

      {/* Priority 5: Printable Credit Note Modal */}
      {creditNoteData && (
        <Modal
          isOpen={Boolean(creditNoteData)}
          onClose={() => setCreditNoteData(null)}
          title={`Credit Note — ${creditNoteData.creditNoteNumber}`}
          description="Official Credit Note receipt for customer refund."
        >
          <div className="space-y-5 text-text-primary">
            {/* Printable Container */}
            <div className="p-5 rounded-xl bg-surface-2/40 border border-border-default space-y-4 print:p-0 print:border-none">
              <div className="flex justify-between items-start border-b border-border-default pb-3">
                <div>
                  <h3 className="text-h3 font-bold text-primary">CREDIT NOTE</h3>
                  <p className="text-small font-mono text-text-primary font-bold">{creditNoteData.creditNoteNumber}</p>
                </div>
                <div className="text-right text-caption text-text-muted">
                  <p>Issue Date: {creditNoteData.issuedAt ? format(new Date(creditNoteData.issuedAt), 'PPP') : '-'}</p>
                  <p>Status: <span className="font-bold text-success">ISSUED / PROCESSED</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-small">
                <div>
                  <p className="text-caption font-semibold text-text-muted uppercase">Original Invoice #</p>
                  <p className="font-bold text-text-primary">{creditNoteData.originalInvoiceNumber}</p>
                </div>
                <div>
                  <p className="text-caption font-semibold text-text-muted uppercase">Customer</p>
                  <p className="font-bold text-text-primary">{creditNoteData.customer?.name || WALK_IN_CUSTOMER_NAME}</p>
                </div>
              </div>

              {/* Items Breakdown */}
              <div className="space-y-2">
                <p className="text-caption font-bold text-text-muted uppercase">Returned Items Breakdown</p>
                <div className="space-y-2 border-t border-border-default pt-2">
                  {(creditNoteData.items || []).map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-small">
                      <div>
                        <p className="font-bold text-text-primary">{it.productName}</p>
                        <p className="text-caption text-text-muted">Qty: {it.quantity} • Net Rate: {formatCurrency(it.unitPrice)}</p>
                      </div>
                      <p className="font-bold text-danger">{formatCurrency(it.refundAmount)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-border-default flex justify-between items-center">
                <span className="text-body font-bold text-text-primary">Total Credit Amount</span>
                <span className="text-h2 font-bold text-danger">{formatCurrency(creditNoteData.totalRefundAmount)}</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-3 border-t border-border-default">
              <Button
                variant="outline"
                leftIcon={PrinterIcon}
                onClick={() => window.print()}
              >
                Print Credit Note
              </Button>
              <Button
                variant="primary"
                onClick={() => setCreditNoteData(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

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
                <p className="text-body font-semibold text-text-primary">{selectedReturn.sale?.Customer?.name || selectedReturn.sale?.customer?.name || selectedReturn.sale?.customerName || WALK_IN_CUSTOMER_NAME}</p>
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
                <p className="text-caption font-semibold text-text-muted uppercase mb-1">Disposition</p>
                {(() => {
                  const disp = formatDisposition(selectedReturn.disposition);
                  return <Badge variant={disp.variant}>{disp.label}</Badge>;
                })()}
              </div>
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase mb-1">Refund Method</p>
                <Badge variant={getMethodVariant(selectedReturn.refundMethod)}>
                  {formatMethodLabel(selectedReturn.refundMethod)}
                </Badge>
              </div>
              <div>
                <p className="text-caption font-semibold text-text-muted uppercase mb-1">Reason Code</p>
                <p className="text-small font-bold text-text-primary">{formatReasonCode(selectedReturn.reasonCode || selectedReturn.reason)}</p>
                {selectedReturn.reasonNotes && <p className="text-caption text-text-muted">{selectedReturn.reasonNotes}</p>}
              </div>
              {selectedReturn.managerApprovalId && (
                <div>
                  <p className="text-caption font-semibold text-text-muted uppercase mb-1">Manager Authorization</p>
                  <Badge variant="secondary">Approved (ID #{selectedReturn.managerApprovalId})</Badge>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-border-default">
              <Button
                variant="outline"
                leftIcon={DocumentTextIcon}
                onClick={() => {
                  handleFetchCreditNote(selectedReturn.saleId);
                  setSelectedReturn(null);
                }}
              >
                View Credit Note
              </Button>
              <Button variant="primary" onClick={() => setSelectedReturn(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
