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
  PrinterIcon
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New PO Form state
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

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/purchase-orders', {
        params: {
          search: searchQuery,
          status: statusFilter
        }
      });
      setOrders(res.data || []);
    } catch (err) {
      console.error('Failed to fetch purchase orders:', err);
      showToast({ type: 'error', title: 'Error', message: 'Failed to load purchase orders.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/api/products');
      setProducts(res.data || []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchProducts();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchOrders();
  };

  const handleAddLineItem = () => {
    if (!selectedProductId) {
      showToast({ type: 'error', title: 'Select Product', message: 'Please select a product.' });
      return;
    }
    const qty = parseInt(itemQty, 10);
    const cost = parseFloat(itemCost);

    if (isNaN(qty) || qty <= 0) {
      showToast({ type: 'error', title: 'Invalid Quantity', message: 'Please enter a valid quantity.' });
      return;
    }
    if (isNaN(cost) || cost < 0) {
      showToast({ type: 'error', title: 'Invalid Cost', message: 'Please enter a valid unit cost.' });
      return;
    }

    const prod = products.find(p => p.id === parseInt(selectedProductId, 10) || p.id === selectedProductId);
    const existingIndex = poItems.findIndex(i => i.productId === selectedProductId);

    if (existingIndex >= 0) {
      const updated = [...poItems];
      updated[existingIndex].quantityOrdered += qty;
      updated[existingIndex].unitCost = cost;
      updated[existingIndex].subtotal = updated[existingIndex].quantityOrdered * cost;
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
          subtotal: qty * cost
        }
      ]);
    }

    // Reset builder
    setSelectedProductId('');
    setItemQty('1');
    setItemCost('');
  };

  const handleRemoveLineItem = (index) => {
    setPoItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleProductSelectChange = (e) => {
    const pId = e.target.value;
    setSelectedProductId(pId);
    if (pId) {
      const prod = products.find(p => p.id === parseInt(pId, 10) || p.id === pId);
      if (prod) {
        setItemCost(prod.cost || prod.price || '');
      }
    } else {
      setItemCost('');
    }
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
        supplierName,
        supplierEmail,
        supplierPhone,
        orderDate,
        expectedDeliveryDate,
        status: 'ORDERED',
        notes,
        items: poItems
      });

      showToast({
        type: 'success',
        title: 'Purchase Order Created',
        message: 'Purchase order generated and sent to supplier status!'
      });

      setShowCreateModal(false);
      setSupplierName('');
      setSupplierEmail('');
      setSupplierPhone('');
      setNotes('');
      setPoItems([]);
      fetchOrders();
    } catch (err) {
      console.error('Failed to create purchase order:', err);
      showToast({ type: 'error', title: 'Save Failed', message: err.response?.data?.error || 'Failed to create PO.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceivePo = async (po) => {
    if (!window.confirm(`Confirm receipt of PO ${po.poNumber}? This will automatically add product items into inventory stock.`)) {
      return;
    }

    try {
      await api.patch(`/api/purchase-orders/${po.id}/status`, { status: 'RECEIVED' });
      showToast({
        type: 'success',
        title: 'PO Received & Stock Updated',
        message: `Inventory stock has been incremented for PO ${po.poNumber}.`
      });
      setShowDetailModal(false);
      fetchOrders();
    } catch (err) {
      console.error('Failed to update PO status:', err);
      showToast({ type: 'error', title: 'Error', message: 'Failed to mark PO as received.' });
    }
  };

  const handleDeletePo = async (id) => {
    if (!window.confirm('Are you sure you want to delete this purchase order?')) return;
    try {
      await api.delete(`/api/purchase-orders/${id}`);
      showToast({ type: 'success', title: 'Deleted', message: 'Purchase Order deleted.' });
      fetchOrders();
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: 'Failed to delete Purchase Order.' });
    }
  };

  // Metrics
  const activeOrdersCount = orders.filter(o => o.status === 'ORDERED').length;
  const committedValueSum = orders
    .filter(o => o.status === 'ORDERED')
    .reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);
  const completedOrdersCount = orders.filter(o => o.status === 'RECEIVED').length;

  const calculateGrandTotal = () => {
    return poItems.reduce((sum, i) => sum + (i.subtotal || 0), 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Purchase Orders (PO Management)"
        description="Issue formal purchase orders to vendors, track pending shipments, and receive stock"
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <ClipboardDocumentCheckIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Active POs</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{activeOrdersCount} active</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-warning/10 text-warning">
            <BanknotesIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Committed Value</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{formatCurrency(committedValueSum)}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-info/10 text-info">
            <TruckIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Pending Deliveries</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{activeOrdersCount} pending</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-success/10 text-success">
            <CheckCircleIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Completed Orders</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{completedOrdersCount} completed</p>
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
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface border border-border-default text-text-primary text-caption font-semibold focus:ring-2 focus:ring-primary/30"
            >
              <option value="ALL">All Statuses</option>
              <option value="ORDERED">Ordered (Pending)</option>
              <option value="RECEIVED">Received</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={ArrowPathIcon}
              onClick={fetchOrders}
            >
              Refresh
            </Button>
          </div>
        </form>
      </Card>

      {/* PO Data Table */}
      <Card className="overflow-hidden border border-border-default">
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
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading purchase orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                orders.map((po) => (
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
                            : po.status === 'ORDERED'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {po.status}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-right space-x-1.5">
                      {po.status === 'ORDERED' && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleReceivePo(po)}
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
                      <button
                        type="button"
                        onClick={() => handleDeletePo(po.id)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Delete PO"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current Stock: {p.stockQuantity})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-caption text-text-secondary mb-1">Order Qty</label>
                <input
                  type="number"
                  min="1"
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
              <div className="border border-border-default rounded-lg overflow-hidden bg-surface max-h-36 overflow-y-auto scrollbar-thin">
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

      {/* PO DETAIL & RECEIVING MODAL */}
      {selectedPo && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Purchase Order #${selectedPo.poNumber}`}
          description={`Created on ${format(new Date(selectedPo.orderDate || selectedPo.createdAt), 'MMM dd, yyyy')}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2/40 border border-border-default rounded-xl text-small">
              <div>
                <p className="text-caption text-text-muted uppercase tracking-wider">Supplier</p>
                <p className="font-bold text-text-primary">{selectedPo.supplierName}</p>
                {selectedPo.supplierEmail && (
                  <p className="text-caption text-text-muted">{selectedPo.supplierEmail}</p>
                )}
                {selectedPo.supplierPhone && (
                  <p className="text-caption text-text-muted">{selectedPo.supplierPhone}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-caption text-text-muted uppercase tracking-wider">Status</p>
                <Badge variant={selectedPo.status === 'RECEIVED' ? 'success' : 'warning'}>
                  {selectedPo.status}
                </Badge>
                {selectedPo.expectedDeliveryDate && (
                  <p className="text-caption text-text-muted mt-1">
                    Expected: {format(new Date(selectedPo.expectedDeliveryDate), 'MMM dd, yyyy')}
                  </p>
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
                    {(selectedPo.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-semibold text-text-primary">{item.productName}</td>
                        <td className="p-2.5 text-center text-text-secondary">{item.quantityOrdered}</td>
                        <td className="p-2.5 text-center text-text-secondary">{item.quantityReceived || 0}</td>
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
              <span>Total PO Value</span>
              <span className="text-primary text-h3 font-extrabold">
                {formatCurrency(parseFloat(selectedPo.totalAmount || 0))}
              </span>
            </div>

            {selectedPo.notes && (
              <div className="p-3 bg-surface-2/30 rounded-xl border border-border-default text-caption text-text-secondary">
                <span className="font-semibold text-text-primary block mb-0.5">Notes:</span>
                {selectedPo.notes}
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-border-default">
              {selectedPo.status === 'ORDERED' ? (
                <Button
                  variant="success"
                  leftIcon={CheckCircleIcon}
                  onClick={() => handleReceivePo(selectedPo)}
                >
                  Mark Received & Add Stock
                </Button>
              ) : (
                <div></div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" leftIcon={PrinterIcon} onClick={() => window.print()}>
                  Print PO
                </Button>
                <Button variant="primary" onClick={() => setShowDetailModal(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
