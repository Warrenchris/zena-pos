import React, { useState, useEffect } from 'react';
import {
  ClipboardDocumentCheckIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  EyeIcon,
  CheckCircleIcon,
  ClockIcon,
  TrashIcon,
  XMarkIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  BanknotesIcon,
  PrinterIcon,
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

export default function PurchaseOrders() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [summary, setSummary] = useState({
    activeOrdersCount: 0,
    committedValue: 0,
    completedOrdersCount: 0,
    totalOrdersCount: 0
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveBatch, setReceiveBatch] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // New PO Form state
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState([]);

  // Line item builder state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemCost, setItemCost] = useState('');

  const fetchOrders = async (targetPage = currentPage) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/purchase-orders', {
        params: {
          page: targetPage,
          limit: 10,
          search: searchQuery,
          status: statusFilter
        }
      });

      if (res.data && res.data.data) {
        setOrders(res.data.data);
        if (res.data.pagination) setPagination(res.data.pagination);
        if (res.data.summary) setSummary(res.data.summary);
      } else {
        setOrders(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      console.error('Failed to fetch purchase orders:', err);
      setError(err.response?.data?.error || 'Failed to load purchase orders. Please try again.');
      showToast({ type: 'error', title: 'Error', message: 'Failed to load purchase orders.' });
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
      console.error('Failed to fetch products/suppliers:', err);
    }
  };

  useEffect(() => {
    fetchOrders(currentPage);
  }, [statusFilter, currentPage]);

  useEffect(() => {
    fetchProductsAndSuppliers();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchOrders(1);
  };

  const handleSupplierSelect = (e) => {
    const sId = e.target.value;
    setSupplierId(sId);
    if (sId) {
      const match = suppliers.find(s => String(s.id) === String(sId));
      if (match) {
        setSupplierName(match.name);
        setSupplierEmail(match.email || '');
        setSupplierPhone(match.phone || match.contactPerson || '');
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
      showToast({ type: 'error', title: 'Select Product', message: 'Please select a product.' });
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
    const existingIndex = poItems.findIndex(i => String(i.productId) === String(selectedProductId));

    if (existingIndex >= 0) {
      const updated = [...poItems];
      updated[existingIndex].quantityOrdered += qty;
      updated[existingIndex].unitCost = cost;
      updated[existingIndex].subtotal = Math.round(updated[existingIndex].quantityOrdered * cost * 100) / 100;
      setPoItems(updated);
    } else {
      setPoItems([
        ...poItems,
        {
          productId: prod?.id || selectedProductId,
          productName: prod?.name || 'Selected Product',
          sku: prod?.sku || '',
          quantityOrdered: qty,
          unitCost: cost,
          subtotal: Math.round(qty * cost * 100) / 100
        }
      ]);
    }

    setSelectedProductId('');
    setItemQty('1');
    setItemCost('');
  };

  const handleRemoveLineItem = (index) => {
    setPoItems(prev => prev.filter((_, i) => i !== index));
  };

  const calculateGrandTotal = () => {
    return Math.round(poItems.reduce((sum, i) => sum + (i.subtotal || 0), 0) * 100) / 100;
  };

  const handleCreatePo = async (e) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      showToast({ type: 'error', title: 'Required Field', message: 'Supplier Name is required.' });
      return;
    }
    if (poItems.length === 0) {
      showToast({ type: 'error', title: 'Empty Items', message: 'Please add at least one product item.' });
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/purchase-orders', {
        supplierId: supplierId || null,
        supplierName,
        supplierEmail,
        supplierPhone,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || null,
        status: 'ORDERED',
        notes,
        items: poItems
      });

      showToast({
        type: 'success',
        title: 'Purchase Order Created',
        message: 'Purchase order generated and sent to vendor successfully!'
      });

      setShowCreateModal(false);
      setSupplierId('');
      setSupplierName('');
      setSupplierEmail('');
      setSupplierPhone('');
      setNotes('');
      setPoItems([]);
      fetchOrders(1);
    } catch (err) {
      console.error('Failed to create purchase order:', err);
      showToast({ type: 'error', title: 'Save Failed', message: err.response?.data?.error || 'Failed to create PO.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Open Partial Receiving Modal
  const handleOpenReceiveModal = (po) => {
    setSelectedPo(po);
    const items = po.lineItems && po.lineItems.length > 0 ? po.lineItems : (po.items || []);
    const initialBatch = items.map(item => {
      const ordered = parseFloat(item.quantityOrdered || 0);
      const prevRec = parseFloat(item.quantityReceived || 0);
      const remaining = Math.max(0, Math.round((ordered - prevRec) * 100) / 100);
      return {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantityOrdered: ordered,
        quantityReceived: prevRec,
        remaining,
        quantityToReceive: remaining // default to full remaining
      };
    });
    setReceiveBatch(initialBatch);
    setShowReceiveModal(true);
  };

  const handleBatchQuantityChange = (index, value) => {
    const val = parseFloat(value);
    setReceiveBatch(prev => {
      const copy = [...prev];
      copy[index].quantityToReceive = isNaN(val) ? 0 : val;
      return copy;
    });
  };

  const handleSubmitReceive = async (e) => {
    e.preventDefault();

    // Validate quantities
    for (const item of receiveBatch) {
      const qty = parseFloat(item.quantityToReceive || 0);
      if (qty < 0) {
        showToast({ type: 'error', title: 'Invalid Quantity', message: `Negative quantity for ${item.productName}` });
        return;
      }
      if (qty > item.remaining) {
        showToast({
          type: 'error',
          title: 'Exceeds Remaining',
          message: `Cannot receive ${qty} units of ${item.productName}. Maximum remaining is ${item.remaining}.`
        });
        return;
      }
    }

    const hasAny = receiveBatch.some(item => parseFloat(item.quantityToReceive || 0) > 0);
    if (!hasAny) {
      showToast({ type: 'error', title: 'No Quantity', message: 'Please enter at least one quantity to receive.' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        receivedItems: receiveBatch
          .filter(i => parseFloat(i.quantityToReceive || 0) > 0)
          .map(i => ({
            productId: i.productId,
            quantityToReceive: parseFloat(i.quantityToReceive)
          }))
      };

      await api.patch(`/api/purchase-orders/${selectedPo.id}/receive`, payload);

      showToast({
        type: 'success',
        title: 'Stock Received & Inventory Updated',
        message: `Inventory stock has been incremented for PO ${selectedPo.poNumber}.`
      });

      setShowReceiveModal(false);
      setShowDetailModal(false);
      fetchOrders();
    } catch (err) {
      console.error('Failed to receive stock:', err);
      showToast({ type: 'error', title: 'Receiving Error', message: err.response?.data?.error || 'Failed to receive PO stock.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPo = (po) => {
    setConfirmDialog({
      title: 'Cancel Purchase Order',
      message: `Are you sure you want to cancel PO ${po.poNumber}? Once cancelled, no further goods can be received on this order.`,
      confirmLabel: 'Cancel Purchase Order',
      variant: 'danger',
      action: async () => {
        try {
          await api.patch(`/api/purchase-orders/${po.id}/cancel`);
          showToast({ type: 'success', title: 'PO Cancelled', message: 'Purchase Order status set to CANCELLED.' });
          fetchOrders();
        } catch (err) {
          showToast({ type: 'error', title: 'Error', message: err.response?.data?.error || 'Failed to cancel PO.' });
        } finally {
          setConfirmDialog(null);
        }
      }
    });
  };

  const handleDeletePo = (po) => {
    setConfirmDialog({
      title: 'Delete Purchase Order',
      message: `Are you sure you want to delete PO ${po.poNumber}? Only purchase orders without received stock can be deleted.`,
      confirmLabel: 'Delete PO',
      variant: 'danger',
      action: async () => {
        try {
          await api.delete(`/api/purchase-orders/${po.id}`);
          showToast({ type: 'success', title: 'Deleted', message: 'Purchase Order deleted.' });
          fetchOrders();
        } catch (err) {
          showToast({ type: 'error', title: 'Error', message: err.response?.data?.error || 'Failed to delete Purchase Order.' });
        } finally {
          setConfirmDialog(null);
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Print View Stylesheet */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-po-voucher, #printable-po-voucher * { visibility: visible; }
          #printable-po-voucher { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <PageHeader
        title="Purchase Orders (PO Management)"
        description="Issue formal purchase orders to vendors, track shipment fulfillment, and receive partial or complete deliveries"
        action={
          <Button
            variant="primary"
            leftIcon={PlusIcon}
            onClick={() => setShowCreateModal(true)}
          >
            New Purchase Order
          </Button>
        }
      />

      {/* Metrics Grid (Server-Side Summary KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <ClipboardDocumentCheckIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Active POs</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{summary.activeOrdersCount || 0} active</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-warning/10 text-warning">
            <BanknotesIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Committed Value</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{formatCurrency(parseFloat(summary.committedValue || 0))}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-info/10 text-info">
            <TruckIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Completed Orders</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{summary.completedOrdersCount || 0} completed</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-success/10 text-success">
            <CheckCircleIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Total Orders</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{summary.totalOrdersCount || 0} total</p>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full sm:w-auto">
            <Input
              type="search"
              placeholder="Search PO # or supplier name..."
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
              <option value="ORDERED">Ordered (Pending)</option>
              <option value="PARTIALLY_RECEIVED">Partially Received</option>
              <option value="RECEIVED">Received</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={ArrowPathIcon}
              onClick={() => fetchOrders(currentPage)}
            >
              Refresh
            </Button>
          </div>
        </form>
      </Card>

      {/* PO Data Table / Distinct UI States */}
      <Card className="overflow-hidden border border-border-default">
        {loading ? (
          <div className="p-12 text-center text-text-muted">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="font-semibold text-text-primary">Loading purchase orders...</p>
            <p className="text-caption text-text-muted mt-1">Retrieving shop purchase orders</p>
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-3">
              <ExclamationTriangleIcon className="h-6 w-6" />
            </div>
            <h3 className="text-h4 font-bold text-text-primary mb-1">Unable to Load Purchase Orders</h3>
            <p className="text-small text-text-muted max-w-md mx-auto mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={() => fetchOrders(currentPage)}>
              Retry Request
            </Button>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-2 text-text-muted flex items-center justify-center mx-auto mb-3">
              <ClipboardDocumentCheckIcon className="h-6 w-6" />
            </div>
            <h3 className="text-h4 font-bold text-text-primary mb-1">No Purchase Orders Found</h3>
            <p className="text-small text-text-muted max-w-md mx-auto mb-4">
              {searchQuery || statusFilter !== 'ALL'
                ? 'No purchase orders match your active filter. Try resetting search filters.'
                : 'No purchase orders created yet. Issue formal orders to suppliers by clicking below.'}
            </p>
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              + Create First PO
            </Button>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-small">
                <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
                  <tr>
                    <th className="p-3.5">PO Number</th>
                    <th className="p-3.5">Supplier</th>
                    <th className="p-3.5">Order Date</th>
                    <th className="p-3.5">Expected Delivery</th>
                    <th className="p-3.5">Total Amount</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {orders.map((po) => {
                    const isReceivable = po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED';
                    return (
                      <tr key={po.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-primary">
                          {po.poNumber}
                        </td>
                        <td className="p-3.5 font-semibold text-text-primary">
                          <div>{po.supplierName}</div>
                          {po.supplierPhone && (
                            <div className="text-caption text-text-muted font-normal">{po.supplierPhone}</div>
                          )}
                        </td>
                        <td className="p-3.5 text-text-secondary">
                          {po.orderDate ? format(new Date(po.orderDate), 'MMM dd, yyyy') : '—'}
                        </td>
                        <td className="p-3.5 text-text-secondary">
                          {po.expectedDeliveryDate ? format(new Date(po.expectedDeliveryDate), 'MMM dd, yyyy') : 'Asap'}
                        </td>
                        <td className="p-3.5 font-bold text-text-primary">
                          {formatCurrency(parseFloat(po.totalAmount || 0))}
                        </td>
                        <td className="p-3.5">
                          <Badge
                            variant={
                              po.status === 'RECEIVED'
                                ? 'success'
                                : po.status === 'PARTIALLY_RECEIVED'
                                ? 'warning'
                                : po.status === 'ORDERED'
                                ? 'info'
                                : 'danger'
                            }
                          >
                            {po.status}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                          {isReceivable && (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleOpenReceiveModal(po)}
                            >
                              Receive Stock
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPo(po);
                              setShowDetailModal(true);
                            }}
                            className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            title="View Details"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          {po.status !== 'CANCELLED' && po.status !== 'RECEIVED' && (
                            <button
                              type="button"
                              onClick={() => handleCancelPo(po)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Cancel PO"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          )}
                          {po.status !== 'RECEIVED' && po.status !== 'PARTIALLY_RECEIVED' && (
                            <button
                              type="button"
                              onClick={() => handleDeletePo(po)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                              title="Delete PO"
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
                  Showing Page <span className="font-bold text-text-primary">{pagination.page}</span> of <span className="font-bold text-text-primary">{pagination.totalPages}</span> ({pagination.total} orders total)
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
                      fetchOrders(prev);
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
                      fetchOrders(next);
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

      {/* CREATE PO MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Purchase Order"
        description="Issue formal PO to supplier with items and expected delivery date"
        size="lg"
      >
        <form onSubmit={handleCreatePo} className="space-y-4">
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
                  <option value="">-- Choose registered supplier or enter vendor details below --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.phone || s.email || 'No contact info'})</option>
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
                placeholder="e.g. Eldoret Dairy Co-operative"
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Supplier Email
              </label>
              <input
                type="email"
                value={supplierEmail}
                onChange={(e) => setSupplierEmail(e.target.value)}
                placeholder="supplier@example.com"
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Supplier Phone
              </label>
              <input
                type="text"
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                placeholder="+254700000000"
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Expected Delivery Date
              </label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Line Item Selector */}
          <div className="p-3 bg-surface-2/40 border border-border-default rounded-xl space-y-3">
            <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted">
              Add Products to Order
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
                <label className="block text-caption text-text-secondary mb-1">Order Qty</label>
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
            {poItems.length > 0 && (
              <div className="border border-border-default rounded-lg overflow-hidden bg-surface max-h-40 overflow-y-auto scrollbar-thin">
                <table className="w-full text-left text-caption">
                  <thead className="bg-surface-2 text-text-secondary font-semibold uppercase border-b border-border-default">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2 text-center">Ordered Qty</th>
                      <th className="p-2 text-right">Unit Cost</th>
                      <th className="p-2 text-right">Subtotal</th>
                      <th className="p-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {poItems.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-semibold text-text-primary">{item.productName}</td>
                        <td className="p-2 text-center text-text-secondary">{item.quantityOrdered}</td>
                        <td className="p-2 text-right text-text-secondary">{formatCurrency(item.unitCost)}</td>
                        <td className="p-2 text-right font-bold text-primary">{formatCurrency(item.subtotal)}</td>
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
            <label className="block text-caption font-semibold text-text-secondary mb-1">Order Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Terms, payment conditions, delivery address..."
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border-default">
            <div>
              <span className="text-caption text-text-muted uppercase tracking-wider block">Estimated PO Total</span>
              <span className="text-h2 font-extrabold text-primary">{formatCurrency(calculateGrandTotal())}</span>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                Create Purchase Order
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* PARTIAL / ITEMIZED RECEIVING MODAL */}
      {selectedPo && (
        <Modal
          isOpen={showReceiveModal}
          onClose={() => setShowReceiveModal(false)}
          title={`Receive Goods: PO #${selectedPo.poNumber}`}
          description="Enter the exact quantity received for each product in this delivery batch"
          size="lg"
        >
          <form onSubmit={handleSubmitReceive} className="space-y-4">
            <div className="border border-border-default rounded-xl overflow-hidden bg-surface">
              <table className="w-full text-left text-small">
                <thead className="bg-surface-2 text-text-secondary text-caption font-semibold uppercase border-b border-border-default">
                  <tr>
                    <th className="p-2.5">Product</th>
                    <th className="p-2.5 text-center">Ordered</th>
                    <th className="p-2.5 text-center">Already Rec'd</th>
                    <th className="p-2.5 text-center">Remaining</th>
                    <th className="p-2.5 text-right w-36">Receive Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {receiveBatch.map((item, idx) => (
                    <tr key={idx} className={item.remaining === 0 ? 'opacity-50 bg-surface-2/30' : ''}>
                      <td className="p-2.5 font-semibold text-text-primary">
                        <div>{item.productName}</div>
                        {item.sku && <div className="text-caption text-text-muted font-mono">{item.sku}</div>}
                      </td>
                      <td className="p-2.5 text-center text-text-secondary">{item.quantityOrdered}</td>
                      <td className="p-2.5 text-center text-text-secondary">{item.quantityReceived}</td>
                      <td className="p-2.5 text-center font-bold text-warning">{item.remaining}</td>
                      <td className="p-2.5 text-right">
                        {item.remaining > 0 ? (
                          <input
                            type="number"
                            min="0"
                            max={item.remaining}
                            step="any"
                            value={item.quantityToReceive}
                            onChange={(e) => handleBatchQuantityChange(idx, e.target.value)}
                            className="w-24 px-2.5 py-1 text-right bg-surface border border-border-default rounded-lg font-bold text-primary focus:ring-2 focus:ring-primary/30"
                          />
                        ) : (
                          <span className="text-caption text-success font-bold">Fulfilled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-surface-2/40 rounded-xl border border-border-default text-caption text-text-muted">
              Note: Incoming stock will be automatically added to inventory quantities and cost averages will be updated. A linked purchase invoice log will be recorded.
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
              <Button type="button" variant="outline" onClick={() => setShowReceiveModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="success" loading={submitting}>
                Confirm Delivery & Add to Stock
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* PO DETAIL & PRINT VOUCHER MODAL */}
      {selectedPo && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Purchase Order #${selectedPo.poNumber}`}
          description={`Created on ${format(new Date(selectedPo.orderDate || selectedPo.createdAt), 'MMM dd, yyyy')}`}
          size="lg"
        >
          <div className="space-y-4" id="printable-po-voucher">
            {/* Header for print voucher */}
            <div className="border-b border-border-default pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-h3 font-black text-text-primary">PURCHASE ORDER</h2>
                  <p className="text-caption font-mono text-primary font-bold">{selectedPo.poNumber}</p>
                </div>
                <div className="text-right">
                  <Badge variant={selectedPo.status === 'RECEIVED' ? 'success' : selectedPo.status === 'PARTIALLY_RECEIVED' ? 'warning' : selectedPo.status === 'ORDERED' ? 'info' : 'danger'}>
                    {selectedPo.status}
                  </Badge>
                  <p className="text-caption text-text-muted mt-1">
                    Date: {format(new Date(selectedPo.orderDate || selectedPo.createdAt), 'dd/MM/yyyy')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2/40 border border-border-default rounded-xl text-small">
              <div>
                <p className="text-caption text-text-muted uppercase tracking-wider">Vendor / Supplier</p>
                <p className="font-bold text-text-primary">{selectedPo.supplierName}</p>
                {selectedPo.supplierEmail && (
                  <p className="text-caption text-text-muted">{selectedPo.supplierEmail}</p>
                )}
                {selectedPo.supplierPhone && (
                  <p className="text-caption text-text-muted">{selectedPo.supplierPhone}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-caption text-text-muted uppercase tracking-wider">Delivery Details</p>
                {selectedPo.expectedDeliveryDate ? (
                  <p className="font-semibold text-text-primary">
                    Expected: {format(new Date(selectedPo.expectedDeliveryDate), 'MMM dd, yyyy')}
                  </p>
                ) : (
                  <p className="text-text-muted">As soon as possible</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-2">Ordered Items</h4>
              <div className="border border-border-default rounded-xl overflow-hidden bg-surface">
                <table className="w-full text-left text-small">
                  <thead className="bg-surface-2 text-text-secondary text-caption font-semibold uppercase border-b border-border-default">
                    <tr>
                      <th className="p-2.5">Product</th>
                      <th className="p-2.5 text-center">Ordered</th>
                      <th className="p-2.5 text-center">Received</th>
                      <th className="p-2.5 text-right">Unit Cost</th>
                      <th className="p-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default">
                    {(selectedPo.lineItems || selectedPo.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-semibold text-text-primary">{item.productName}</td>
                        <td className="p-2.5 text-center text-text-secondary">{item.quantityOrdered}</td>
                        <td className="p-2.5 text-center font-bold text-primary">{item.quantityReceived || 0}</td>
                        <td className="p-2.5 text-right text-text-secondary">{formatCurrency(item.unitCost)}</td>
                        <td className="p-2.5 text-right font-bold text-primary">
                          {formatCurrency((item.subtotal || item.quantityOrdered * item.unitCost))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 bg-surface-2/60 border border-border-default rounded-xl flex justify-between items-center text-body font-bold">
              <span>Total PO Value:</span>
              <span className="text-primary text-h3 font-extrabold">
                {formatCurrency(parseFloat(selectedPo.totalAmount || 0))}
              </span>
            </div>

            {selectedPo.notes && (
              <div className="p-3 bg-surface-2/30 rounded-xl border border-border-default text-caption text-text-secondary">
                <span className="font-semibold text-text-primary block mb-0.5">Order Notes & Terms:</span>
                {selectedPo.notes}
              </div>
            )}

            {/* Print Signatures */}
            <div className="pt-6 border-t border-border-default grid grid-cols-2 gap-8 text-caption text-text-muted">
              <div>
                <div className="border-b border-text-muted/40 h-8"></div>
                <p className="mt-1 font-semibold">Authorized Purchasing Officer</p>
              </div>
              <div className="text-right">
                <div className="border-b border-text-muted/40 h-8"></div>
                <p className="mt-1 font-semibold">Supplier Acceptance & Date</p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-border-default no-print">
              {(selectedPo.status === 'ORDERED' || selectedPo.status === 'PARTIALLY_RECEIVED') ? (
                <Button
                  variant="success"
                  leftIcon={CheckCircleIcon}
                  onClick={() => {
                    setShowDetailModal(false);
                    handleOpenReceiveModal(selectedPo);
                  }}
                >
                  Receive Delivery Batch
                </Button>
              ) : (
                <div></div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" leftIcon={PrinterIcon} onClick={() => window.print()}>
                  Print PO Document
                </Button>
                <Button variant="primary" onClick={() => setShowDetailModal(false)}>
                  Close
                </Button>
              </div>
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
                Dismiss
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
