import React, { useState, useEffect } from 'react';
import {
  ShoppingBagIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  PrinterIcon,
  TrashIcon,
  EyeIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  BuildingStorefrontIcon,
  BanknotesIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import useCurrency from '../hooks/useCurrency';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import { useToast } from '../components/Toast';
import { format } from 'date-fns';

export default function Purchases() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [purchases, setPurchases] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [summary, setSummary] = useState({
    totalPurchasesAmount: 0,
    receivedStockCount: 0,
    pendingDeliveriesCount: 0,
    activeSuppliersCount: 0
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters and search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Payment Recording State
  const [paymentAmount, setPaymentAmount] = useState('');
  const [recordPayMethod, setRecordPayMethod] = useState('CASH');

  // New Purchase Form state
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentStatus, setPaymentStatus] = useState('PAID');
  const [partialPaidAmount, setPartialPaidAmount] = useState('');
  const [status, setStatus] = useState('RECEIVED');
  const [notes, setNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState([]);

  // Form line-item builder state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemCost, setItemCost] = useState('');

  const fetchPurchases = async (targetPage = currentPage) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/purchases', {
        params: {
          page: targetPage,
          limit: 10,
          search: searchQuery,
          status: statusFilter,
          paymentStatus: paymentFilter
        }
      });

      if (res.data && res.data.data) {
        setPurchases(res.data.data);
        if (res.data.pagination) setPagination(res.data.pagination);
        if (res.data.summary) setSummary(res.data.summary);
      } else {
        setPurchases(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch purchases:', err);
      setError(err.response?.data?.error || 'Failed to connect to the purchases service. Please check your network or try again.');
      showToast({ type: 'error', title: 'Loading Error', message: 'Failed to load purchases data.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsAndSuppliers = async () => {
    try {
      const [prodRes, suppRes] = await Promise.allSettled([
        api.get('/api/products'),
        api.get('/api/suppliers')
      ]);

      if (prodRes.status === 'fulfilled') {
        const list = Array.isArray(prodRes.value.data)
          ? prodRes.value.data
          : (Array.isArray(prodRes.value.data?.products)
              ? prodRes.value.data.products
              : (Array.isArray(prodRes.value.data?.rows) ? prodRes.value.data.rows : []));
        setProducts(list);
      }

      if (suppRes.status === 'fulfilled') {
        setSuppliers(Array.isArray(suppRes.value.data) ? suppRes.value.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch support data:', err);
    }
  };

  useEffect(() => {
    fetchPurchases(currentPage);
  }, [statusFilter, paymentFilter, currentPage]);

  useEffect(() => {
    fetchProductsAndSuppliers();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchPurchases(1);
  };

  const handleSupplierSelect = (e) => {
    const sId = e.target.value;
    setSupplierId(sId);
    if (sId) {
      const match = suppliers.find(s => String(s.id) === String(sId));
      if (match) {
        setSupplierName(match.name);
        setSupplierContact(match.phone || match.contactPerson || '');
      }
    }
  };

  const handleProductSelectChange = (e) => {
    const pId = e.target.value;
    setSelectedProductId(pId);
    if (pId) {
      const prod = products.find(p => String(p.id) === String(pId));
      if (prod) {
        setItemCost(prod.cost || prod.price || '');
      }
    } else {
      setItemCost('');
    }
  };

  const handleAddLineItem = () => {
    if (!selectedProductId) {
      showToast({ type: 'error', title: 'Select Product', message: 'Please select a product to add.' });
      return;
    }
    const qty = parseFloat(itemQty);
    const cost = parseFloat(itemCost);

    if (isNaN(qty) || qty <= 0) {
      showToast({ type: 'error', title: 'Invalid Quantity', message: 'Please enter a valid quantity greater than 0.' });
      return;
    }
    if (isNaN(cost) || cost < 0) {
      showToast({ type: 'error', title: 'Invalid Cost', message: 'Please enter a valid non-negative unit cost.' });
      return;
    }

    const prod = products.find(p => String(p.id) === String(selectedProductId));
    const existingIndex = purchaseItems.findIndex(i => String(i.productId) === String(selectedProductId));

    if (existingIndex >= 0) {
      const updated = [...purchaseItems];
      updated[existingIndex].quantity += qty;
      updated[existingIndex].unitCost = cost;
      updated[existingIndex].totalCost = Math.round(updated[existingIndex].quantity * cost * 100) / 100;
      setPurchaseItems(updated);
    } else {
      setPurchaseItems([
        ...purchaseItems,
        {
          productId: prod?.id || selectedProductId,
          productName: prod?.name || 'Selected Product',
          sku: prod?.sku || '',
          quantity: qty,
          unitCost: cost,
          totalCost: Math.round(qty * cost * 100) / 100
        }
      ]);
    }

    setSelectedProductId('');
    setItemQty('1');
    setItemCost('');
  };

  const handleRemoveLineItem = (index) => {
    setPurchaseItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateGrandTotal = () => {
    return Math.round(purchaseItems.reduce((sum, i) => sum + (i.totalCost || 0), 0) * 100) / 100;
  };

  const handleCreatePurchase = async (e) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      showToast({ type: 'error', title: 'Required Field', message: 'Supplier Name is required.' });
      return;
    }
    if (purchaseItems.length === 0) {
      showToast({ type: 'error', title: 'Empty Items', message: 'Please add at least one product item.' });
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/purchases', {
        supplierId: supplierId || null,
        supplierName,
        supplierContact,
        purchaseDate,
        paymentMethod,
        paymentStatus,
        paidAmount: paymentStatus === 'PARTIAL' ? parseFloat(partialPaidAmount) : undefined,
        status,
        notes,
        items: purchaseItems
      });

      showToast({
        type: 'success',
        title: 'Purchase Recorded',
        message: status === 'RECEIVED' ? 'Stock received and inventory quantities updated!' : 'Purchase record saved successfully.'
      });

      setShowCreateModal(false);
      setSupplierId('');
      setSupplierName('');
      setSupplierContact('');
      setNotes('');
      setPurchaseItems([]);
      fetchPurchases(1);
    } catch (err) {
      console.error('Failed to create purchase:', err);
      showToast({ type: 'error', title: 'Save Failed', message: err.response?.data?.error || 'Failed to record purchase.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceivePendingPurchase = (purchase) => {
    setConfirmDialog({
      title: 'Receive Purchase Stock',
      message: `Are you sure you want to mark purchase ${purchase.referenceNo} as RECEIVED? This will atomically increment inventory stock and log a stock receipt.`,
      confirmLabel: 'Confirm Receipt',
      variant: 'success',
      action: async () => {
        try {
          await api.patch(`/api/purchases/${purchase.id}/receive`);
          showToast({ type: 'success', title: 'Stock Received', message: `Stock for ${purchase.referenceNo} added to inventory.` });
          fetchPurchases();
        } catch (err) {
          showToast({ type: 'error', title: 'Error', message: err.response?.data?.error || 'Failed to receive stock.' });
        } finally {
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleCancelPurchase = (purchase) => {
    const isReceived = purchase.status === 'RECEIVED';
    setConfirmDialog({
      title: 'Cancel Purchase Record',
      message: isReceived
        ? `CAUTION: Purchase ${purchase.referenceNo} was already received into stock. Cancelling it will ATOMICALLY REVERSE and DEDUCT the items from your inventory.`
        : `Are you sure you want to cancel purchase ${purchase.referenceNo}?`,
      confirmLabel: isReceived ? 'Reverse Stock & Cancel' : 'Cancel Purchase',
      variant: 'danger',
      action: async () => {
        try {
          await api.patch(`/api/purchases/${purchase.id}/cancel`);
          showToast({ type: 'success', title: 'Cancelled', message: 'Purchase record cancelled successfully.' });
          fetchPurchases();
        } catch (err) {
          showToast({ type: 'error', title: 'Cancellation Failed', message: err.response?.data?.error || 'Failed to cancel purchase.' });
        } finally {
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleOpenPaymentModal = (purchase) => {
    setSelectedPurchase(purchase);
    const total = parseFloat(purchase.totalAmount || 0);
    const paid = parseFloat(purchase.paidAmount || 0);
    const outstanding = Math.max(0, Math.round((total - paid) * 100) / 100);
    setPaymentAmount(outstanding.toString());
    setRecordPayMethod('CASH');
    setShowPaymentModal(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    const payAmt = parseFloat(paymentAmount);
    if (isNaN(payAmt) || payAmt <= 0) {
      showToast({ type: 'error', title: 'Invalid Amount', message: 'Please enter a valid payment amount.' });
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/api/purchases/${selectedPurchase.id}/payments`, {
        amount: payAmt,
        paymentMethod: recordPayMethod
      });
      showToast({ type: 'success', title: 'Payment Recorded', message: `Payment of ${formatCurrency(payAmt)} saved.` });
      setShowPaymentModal(false);
      fetchPurchases();
    } catch (err) {
      showToast({ type: 'error', title: 'Payment Error', message: err.response?.data?.error || 'Failed to record payment.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Print View Stylesheet */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-purchase-voucher, #printable-purchase-voucher * { visibility: visible; }
          #printable-purchase-voucher { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <PageHeader
        title="Purchases & Inventory Receiving"
        description="Track supplier orders, receive warehouse stock, and maintain financial inventory balances"
        action={
          <Button
            variant="primary"
            leftIcon={PlusIcon}
            onClick={() => setShowCreateModal(true)}
          >
            Record Purchase
          </Button>
        }
      />

      {/* Global Metrics Grid (Server-Side Aggregations) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <BanknotesIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Total Purchases</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{formatCurrency(parseFloat(summary.totalPurchasesAmount || 0))}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-success/10 text-success">
            <CheckCircleIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Received Stock</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{summary.receivedStockCount || 0} orders</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-warning/10 text-warning">
            <ClockIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Pending Deliveries</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{summary.pendingDeliveriesCount || 0} pending</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-info/10 text-info">
            <BuildingStorefrontIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Active Suppliers</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{summary.activeSuppliersCount || 0} suppliers</p>
          </div>
        </Card>
      </div>

      {/* Filter & Action Toolbar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full sm:w-auto relative">
            <Input
              type="search"
              placeholder="Search reference # or supplier name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 rounded-xl bg-surface border border-border-default text-text-primary text-caption font-semibold focus:ring-2 focus:ring-primary/30"
            >
              <option value="ALL">All Statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => { setPaymentFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 rounded-xl bg-surface border border-border-default text-text-primary text-caption font-semibold focus:ring-2 focus:ring-primary/30"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="UNPAID">Unpaid</option>
            </select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={ArrowPathIcon}
              onClick={() => fetchPurchases(currentPage)}
            >
              Refresh
            </Button>
          </div>
        </form>
      </Card>

      {/* Purchases Data Table / Distinct UI States */}
      <Card className="overflow-hidden border border-border-default">
        {loading ? (
          <div className="p-12 text-center text-text-muted">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="font-semibold text-text-primary">Loading purchases...</p>
            <p className="text-caption text-text-muted mt-1">Retrieving tenant purchasing ledger records</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-3">
              <ExclamationTriangleIcon className="h-6 w-6" />
            </div>
            <h3 className="text-h4 font-bold text-text-primary mb-1">Unable to Load Purchases</h3>
            <p className="text-small text-text-muted max-w-md mx-auto mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={() => fetchPurchases(currentPage)}>
              Retry Request
            </Button>
          </div>
        ) : purchases.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 text-text-muted flex items-center justify-center mx-auto mb-3">
              <ShoppingBagIcon className="h-6 w-6" />
            </div>
            <h3 className="text-h4 font-bold text-text-primary mb-1">No Purchase Records Found</h3>
            <p className="text-small text-text-muted max-w-md mx-auto mb-4">
              {searchQuery || statusFilter !== 'ALL' || paymentFilter !== 'ALL'
                ? 'No purchases match your active filter criteria. Try adjusting your search query or reset filters.'
                : 'No purchase records recorded yet for this shop. Click below to record your first inventory purchase.'}
            </p>
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              + Record First Purchase
            </Button>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-small">
                <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
                  <tr>
                    <th className="p-3.5">Reference #</th>
                    <th className="p-3.5">Supplier</th>
                    <th className="p-3.5">Purchase Date</th>
                    <th className="p-3.5">Items</th>
                    <th className="p-3.5">Total / Paid</th>
                    <th className="p-3.5">Payment</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {purchases.map((purchase) => {
                    const lineItemsCount = Array.isArray(purchase.lineItems)
                      ? purchase.lineItems.length
                      : (Array.isArray(purchase.items) ? purchase.items.length : 0);
                    const totalAmt = parseFloat(purchase.totalAmount || 0);
                    const paidAmt = parseFloat(purchase.paidAmount || 0);

                    return (
                      <tr key={purchase.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-primary">
                          {purchase.referenceNo}
                        </td>
                        <td className="p-3.5 font-semibold text-text-primary">
                          <div>{purchase.supplierName}</div>
                          {purchase.supplierContact && (
                            <div className="text-caption text-text-muted font-normal">{purchase.supplierContact}</div>
                          )}
                        </td>
                        <td className="p-3.5 text-text-secondary">
                          {purchase.purchaseDate ? format(new Date(purchase.purchaseDate), 'MMM dd, yyyy') : '—'}
                        </td>
                        <td className="p-3.5 text-text-secondary">
                          <span className="font-semibold text-text-primary">{lineItemsCount}</span> items
                        </td>
                        <td className="p-3.5 font-bold text-text-primary">
                          <div>{formatCurrency(totalAmt)}</div>
                          {purchase.paymentStatus !== 'PAID' && (
                            <div className="text-caption text-text-muted font-normal">
                              Paid: {formatCurrency(paidAmt)}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="space-y-0.5">
                            <Badge
                              variant={
                                purchase.paymentStatus === 'PAID'
                                  ? 'success'
                                  : purchase.paymentStatus === 'PARTIAL'
                                  ? 'warning'
                                  : 'danger'
                              }
                              size="sm"
                            >
                              {purchase.paymentStatus}
                            </Badge>
                            <div className="text-caption text-text-muted font-mono">{purchase.paymentMethod}</div>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <Badge
                            variant={
                              purchase.status === 'RECEIVED'
                                ? 'success'
                                : purchase.status === 'PENDING'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {purchase.status}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                          {purchase.status === 'PENDING' && (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleReceivePendingPurchase(purchase)}
                              title="Receive Goods into Inventory"
                            >
                              Receive Stock
                            </Button>
                          )}
                          {purchase.status !== 'CANCELLED' && purchase.paymentStatus !== 'PAID' && (
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={CreditCardIcon}
                              onClick={() => handleOpenPaymentModal(purchase)}
                              title="Record Payment"
                            >
                              Pay
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPurchase(purchase);
                              setShowDetailModal(true);
                            }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          {purchase.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => handleCancelPurchase(purchase)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Cancel / Void Purchase"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-border-default flex items-center justify-between">
                <p className="text-caption text-text-muted">
                  Showing Page <span className="font-bold text-text-primary">{pagination.page}</span> of <span className="font-bold text-text-primary">{pagination.totalPages}</span> ({pagination.total} records total)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={ChevronLeftIcon}
                    disabled={pagination.page <= 1}
                    onClick={() => {
                      const prev = pagination.page - 1;
                      setCurrentPage(prev);
                      fetchPurchases(prev);
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    rightIcon={ChevronRightIcon}
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => {
                      const next = pagination.page + 1;
                      setCurrentPage(next);
                      fetchPurchases(next);
                    }}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* CREATE NEW PURCHASE MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Record New Purchase"
        description="Enter supplier details and itemized products to update inventory stock"
        size="lg"
      >
        <form onSubmit={handleCreatePurchase} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {suppliers.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-caption font-semibold text-text-secondary mb-1">
                  Select Existing Supplier
                </label>
                <select
                  value={supplierId}
                  onChange={handleSupplierSelect}
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">-- Choose registered supplier or type new below --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.phone || s.contactPerson || 'No phone'})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Supplier Name *
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Kenya Wholesalers Ltd"
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Supplier Phone / Contact
              </label>
              <input
                type="text"
                value={supplierContact}
                onChange={(e) => setSupplierContact(e.target.value)}
                placeholder="e.g. +254711223344"
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Purchase Date
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="CASH">Cash</option>
                <option value="M-PESA">M-PESA</option>
                <option value="BANK TRANSFER">Bank Transfer</option>
                <option value="CREDIT">Supplier Credit</option>
              </select>
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Payment Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="PAID">Paid in Full</option>
                <option value="PARTIAL">Partial Payment</option>
                <option value="UNPAID">Unpaid / Credit</option>
              </select>
            </div>

            {paymentStatus === 'PARTIAL' && (
              <div>
                <label className="block text-caption font-semibold text-text-secondary mb-1">
                  Amount Paid Now
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={partialPaidAmount}
                  onChange={(e) => setPartialPaidAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Fulfillment Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="RECEIVED">Received (Auto-updates Stock)</option>
                <option value="PENDING">Pending Delivery</option>
              </select>
            </div>
          </div>

          {/* Itemized Line Builder */}
          <div className="p-3 bg-surface-2/40 border border-border-default rounded-xl space-y-3">
            <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted">
              Add Products to Purchase
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-6">
                <label className="block text-caption text-text-secondary mb-1">Product</label>
                <select
                  value={selectedProductId}
                  onChange={handleProductSelectChange}
                  className="w-full px-3 py-1.5 bg-surface border border-border-default rounded-lg text-text-primary text-caption focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select Inventory Product...</option>
                  {(Array.isArray(products) ? products : []).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock: {p.stockQuantity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-caption text-text-secondary mb-1">Qty</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface border border-border-default rounded-lg text-text-primary text-caption font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-caption text-text-secondary mb-1">Unit Cost</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={itemCost}
                  placeholder="0.00"
                  onChange={(e) => setItemCost(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-surface border border-border-default rounded-lg text-text-primary text-caption font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={handleAddLineItem}
                >
                  + Add
                </Button>
              </div>
            </div>

            {/* Added Items List */}
            {purchaseItems.length > 0 && (
              <div className="border border-border-default rounded-lg overflow-hidden bg-surface max-h-40 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-caption">
                  <thead className="bg-surface-2 text-text-secondary font-semibold uppercase border-b border-border-default">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Unit Cost</th>
                      <th className="p-2 text-right">Subtotal</th>
                      <th className="p-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {purchaseItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-semibold text-text-primary">{item.productName}</td>
                        <td className="p-2 text-center text-text-secondary">{item.quantity}</td>
                        <td className="p-2 text-right text-text-secondary">{formatCurrency(item.unitCost)}</td>
                        <td className="p-2 text-right font-bold text-primary">{formatCurrency(item.totalCost)}</td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(idx)}
                            className="text-danger hover:bg-danger/10 p-1 rounded-lg"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional delivery instructions or notes..."
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border-default">
            <div>
              <span className="text-caption text-text-muted uppercase tracking-wider block">Grand Total</span>
              <span className="text-h2 font-extrabold text-primary">{formatCurrency(calculateGrandTotal())}</span>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                Submit & Save Purchase
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* RECORD PAYMENT MODAL */}
      {selectedPurchase && (
        <Modal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          title={`Record Payment for #${selectedPurchase.referenceNo}`}
          description={`Supplier: ${selectedPurchase.supplierName}`}
        >
          <form onSubmit={handleSubmitPayment} className="space-y-4">
            <div className="p-3 bg-surface-2/40 rounded-xl border border-border-default flex justify-between text-small">
              <span>Outstanding Balance:</span>
              <span className="font-bold text-danger">
                {formatCurrency(Math.max(0, parseFloat(selectedPurchase.totalAmount || 0) - parseFloat(selectedPurchase.paidAmount || 0)))}
              </span>
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Payment Amount *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary font-bold text-body"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Payment Method
              </label>
              <select
                value={recordPayMethod}
                onChange={(e) => setRecordPayMethod(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small"
              >
                <option value="CASH">Cash</option>
                <option value="M-PESA">M-PESA</option>
                <option value="BANK TRANSFER">Bank Transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
              <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                Confirm Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* VIEW PURCHASE DETAILS & PRINT VOUCHER MODAL */}
      {selectedPurchase && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Purchase #${selectedPurchase.referenceNo}`}
          description={`Recorded on ${format(new Date(selectedPurchase.purchaseDate || selectedPurchase.createdAt), 'MMM dd, yyyy')}`}
          size="lg"
        >
          <div className="space-y-4" id="printable-purchase-voucher">
            {/* Header for print voucher */}
            <div className="border-b border-border-default pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-h3 font-black text-text-primary">PURCHASE VOUCHER</h2>
                  <p className="text-caption font-mono text-primary font-bold">{selectedPurchase.referenceNo}</p>
                </div>
                <div className="text-right">
                  <Badge variant={selectedPurchase.status === 'RECEIVED' ? 'success' : selectedPurchase.status === 'PENDING' ? 'warning' : 'danger'}>
                    {selectedPurchase.status}
                  </Badge>
                  <p className="text-caption text-text-muted mt-1">
                    {format(new Date(selectedPurchase.purchaseDate || selectedPurchase.createdAt), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2/40 border border-border-default rounded-xl text-small">
              <div>
                <p className="text-caption text-text-muted uppercase tracking-wider">Supplier</p>
                <p className="font-bold text-text-primary">{selectedPurchase.supplierName}</p>
                {selectedPurchase.supplierContact && (
                  <p className="text-caption text-text-muted">{selectedPurchase.supplierContact}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-caption text-text-muted uppercase tracking-wider">Payment Status</p>
                <Badge variant={selectedPurchase.paymentStatus === 'PAID' ? 'success' : 'warning'}>
                  {selectedPurchase.paymentStatus} ({selectedPurchase.paymentMethod})
                </Badge>
              </div>
            </div>

            <div>
              <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-2">Itemized Products</h4>
              <div className="border border-border-default rounded-xl overflow-hidden bg-surface">
                <table className="w-full text-left text-small">
                  <thead className="bg-surface-2 text-text-secondary text-caption font-semibold uppercase border-b border-border-default">
                    <tr>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Unit Cost</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {(selectedPurchase.lineItems || selectedPurchase.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-semibold text-text-primary">{item.productName}</td>
                        <td className="p-2.5 text-center text-text-secondary">{item.quantity}</td>
                        <td className="p-2.5 text-right text-text-secondary">{formatCurrency(item.unitCost)}</td>
                        <td className="p-2.5 text-right font-bold text-primary">
                          {formatCurrency((item.totalCost || item.quantity * item.unitCost))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-surface-2/60 border border-border-default rounded-xl space-y-1">
              <div className="flex justify-between items-center text-body font-bold">
                <span>Grand Total:</span>
                <span className="text-primary text-h3 font-extrabold">
                  {formatCurrency(parseFloat(selectedPurchase.totalAmount || 0))}
                </span>
              </div>
              <div className="flex justify-between items-center text-small text-text-muted">
                <span>Paid Amount:</span>
                <span className="font-semibold text-text-primary">{formatCurrency(parseFloat(selectedPurchase.paidAmount || 0))}</span>
              </div>
              <div className="flex justify-between items-center text-small text-text-muted">
                <span>Outstanding Balance:</span>
                <span className="font-semibold text-danger">
                  {formatCurrency(Math.max(0, parseFloat(selectedPurchase.totalAmount || 0) - parseFloat(selectedPurchase.paidAmount || 0)))}
                </span>
              </div>
            </div>

            {selectedPurchase.notes && (
              <div className="p-3 bg-surface-2/30 rounded-xl border border-border-default text-caption text-text-secondary">
                <span className="font-semibold text-text-primary block mb-0.5">Notes:</span>
                {selectedPurchase.notes}
              </div>
            )}

            {/* Print Voucher Signature Section */}
            <div className="pt-6 border-t border-border-default grid grid-cols-2 gap-8 text-caption text-text-muted">
              <div>
                <div className="border-b border-text-muted/40 h-8"></div>
                <p className="mt-1 font-semibold">Authorized Signature & Stamp</p>
              </div>
              <div className="text-right">
                <div className="border-b border-text-muted/40 h-8"></div>
                <p className="mt-1 font-semibold">Storekeeper / Receiver Signature</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border-default no-print">
              <Button variant="outline" leftIcon={PrinterIcon} onClick={() => window.print()}>
                Print Voucher
              </Button>
              <Button variant="primary" onClick={() => setShowDetailModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ACCESSIBLE CONFIRMATION DIALOG */}
      {confirmDialog && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmDialog(null)}
          title={confirmDialog.title}
        >
          <div className="space-y-4">
            <p className="text-small text-text-secondary">{confirmDialog.message}</p>
            <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmDialog.variant || 'primary'}
                onClick={confirmDialog.action}
              >
                {confirmDialog.confirmLabel}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
