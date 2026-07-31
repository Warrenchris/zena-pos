import React, { useState, useEffect } from 'react';
import {
  ShoppingBagIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  FunnelIcon,
  DocumentArrowDownIcon,
  PrinterIcon,
  TrashIcon,
  EyeIcon,
  CheckCircleIcon,
  ClockIcon,
  XMarkIcon,
  BuildingStorefrontIcon,
  BanknotesIcon,
  TagIcon
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Purchase Form state
  const [supplierName, setSupplierName] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentStatus, setPaymentStatus] = useState('PAID');
  const [status, setStatus] = useState('RECEIVED');
  const [notes, setNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState([]);

  // Form line-item builder state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemCost, setItemCost] = useState('');

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/purchases', {
        params: {
          search: searchQuery,
          status: statusFilter,
          paymentStatus: paymentFilter
        }
      });
      setPurchases(res.data || []);
    } catch (err) {
      console.error('Failed to fetch purchases:', err);
      showToast({ type: 'error', title: 'Error', message: 'Failed to load purchases data.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/api/products');
      const list = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.products)
            ? res.data.products
            : (Array.isArray(res.data?.rows) ? res.data.rows : []));
      setProducts(list);
    } catch (err) {
      console.error('Failed to fetch products:', err);
      setProducts([]);
    }
  };

  useEffect(() => {
    fetchPurchases();
    fetchProducts();
  }, [statusFilter, paymentFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchPurchases();
  };

  const handleAddLineItem = () => {
    if (!selectedProductId) {
      showToast({ type: 'error', title: 'Select Product', message: 'Please select a product to add.' });
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
    const existingIndex = purchaseItems.findIndex(i => i.productId === selectedProductId);

    if (existingIndex >= 0) {
      const updated = [...purchaseItems];
      updated[existingIndex].quantity += qty;
      updated[existingIndex].unitCost = cost;
      updated[existingIndex].totalCost = updated[existingIndex].quantity * cost;
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
          totalCost: qty * cost
        }
      ]);
    }

    // Reset line builder
    setSelectedProductId('');
    setItemQty('1');
    setItemCost('');
  };

  const handleRemoveLineItem = (index) => {
    setPurchaseItems(prev => prev.filter((_, i) => i !== index));
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
        supplierName,
        supplierContact,
        purchaseDate,
        paymentMethod,
        paymentStatus,
        status,
        notes,
        items: purchaseItems
      });

      showToast({
        type: 'success',
        title: 'Purchase Recorded',
        message: status === 'RECEIVED' ? 'Stock received and inventory quantities updated!' : 'Purchase order created successfully.'
      });

      // Reset form
      setShowCreateModal(false);
      setSupplierName('');
      setSupplierContact('');
      setNotes('');
      setPurchaseItems([]);
      fetchPurchases();
    } catch (err) {
      console.error('Failed to create purchase:', err);
      showToast({ type: 'error', title: 'Save Failed', message: err.response?.data?.error || 'Failed to record purchase.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePurchase = async (id) => {
    if (!window.confirm('Are you sure you want to delete this purchase record?')) return;
    try {
      await api.delete(`/api/purchases/${id}`);
      showToast({ type: 'success', title: 'Deleted', message: 'Purchase record deleted successfully.' });
      fetchPurchases();
    } catch (err) {
      showToast({ type: 'error', title: 'Error', message: 'Failed to delete purchase record.' });
    }
  };

  // Metrics
  const totalAmountSum = purchases.reduce((sum, p) => sum + (parseFloat(p.totalAmount) || 0), 0);
  const totalReceivedCount = purchases.filter(p => p.status === 'RECEIVED').length;
  const totalPendingCount = purchases.filter(p => p.status === 'PENDING').length;
  const uniqueSuppliers = new Set(purchases.map(p => p.supplierName)).size;

  const calculateGrandTotal = () => {
    return purchaseItems.reduce((sum, i) => sum + (i.totalCost || 0), 0);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Purchases & Inventory Receiving"
        description="Track supplier orders, receive stock, and auto-update inventory levels"
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <BanknotesIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Total Purchases</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{formatCurrency(totalAmountSum)}</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-success/10 text-success">
            <CheckCircleIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Received Stock</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{totalReceivedCount} orders</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-warning/10 text-warning">
            <ClockIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Pending Deliveries</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{totalPendingCount} pending</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-info/10 text-info">
            <BuildingStorefrontIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Active Suppliers</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{uniqueSuppliers} suppliers</p>
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
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface border border-border-default text-text-primary text-caption font-semibold focus:ring-2 focus:ring-primary/30"
            >
              <option value="ALL">All Statuses</option>
              <option value="RECEIVED">Received</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface border border-border-default text-text-primary text-caption font-semibold focus:ring-2 focus:ring-primary/30"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid</option>
              <option value="PARTIAL">Partial</option>
            </select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={ArrowPathIcon}
              onClick={fetchPurchases}
            >
              Refresh
            </Button>
          </div>
        </form>
      </Card>

      {/* Purchases Data Table */}
      <Card className="overflow-hidden border border-border-default">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-small">
            <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
              <tr>
                <th className="p-3.5">Reference #</th>
                <th className="p-3.5">Supplier</th>
                <th className="p-3.5">Purchase Date</th>
                <th className="p-3.5">Items</th>
                <th className="p-3.5">Total Amount</th>
                <th className="p-3.5">Payment</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-text-muted">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading purchases...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-text-muted">
                    No purchase records found matching your filters.
                  </td>
                </tr>
              ) : (
                purchases.map((purchase) => {
                  const itemCount = Array.isArray(purchase.items) ? purchase.items.length : 0;
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
                        <span className="font-semibold text-text-primary">{itemCount}</span> items
                      </td>
                      <td className="p-3.5 font-bold text-text-primary">
                        {formatCurrency(parseFloat(purchase.totalAmount || 0))}
                      </td>
                      <td className="p-3.5">
                        <div className="space-y-0.5">
                          <Badge variant={purchase.paymentStatus === 'PAID' ? 'success' : 'danger'} size="sm">
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
                      <td className="p-3.5 text-right space-x-2">
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
                        <button
                          type="button"
                          onClick={() => handleDeletePurchase(purchase.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                          title="Delete Record"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Supplier Name *
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Kenyan Beverages Distributors"
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
                <option value="PAID">Paid</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIAL">Partial</option>
              </select>
            </div>

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
            {purchaseItems.length > 0 && (
              <div className="border border-border-default rounded-lg overflow-hidden bg-surface max-h-36 overflow-y-auto scrollbar-thin">
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

      {/* VIEW PURCHASE DETAILS MODAL */}
      {selectedPurchase && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          title={`Purchase #${selectedPurchase.referenceNo}`}
          description={`Recorded on ${format(new Date(selectedPurchase.purchaseDate || selectedPurchase.createdAt), 'MMM dd, yyyy')}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2/40 border border-border-default rounded-xl text-small">
              <div>
                <p className="text-caption text-text-muted uppercase tracking-wider">Supplier</p>
                <p className="font-bold text-text-primary">{selectedPurchase.supplierName}</p>
                {selectedPurchase.supplierContact && (
                  <p className="text-caption text-text-muted">{selectedPurchase.supplierContact}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-caption text-text-muted uppercase tracking-wider">Fulfillment Status</p>
                <Badge variant={selectedPurchase.status === 'RECEIVED' ? 'success' : 'warning'}>
                  {selectedPurchase.status}
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
                    {(selectedPurchase.items || []).map((item, idx) => (
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

            <div className="p-3 bg-surface-2/60 border border-border-default rounded-xl flex justify-between items-center text-body font-bold">
              <span>Total Amount</span>
              <span className="text-primary text-h3 font-extrabold">
                {formatCurrency(parseFloat(selectedPurchase.totalAmount || 0))}
              </span>
            </div>

            {selectedPurchase.notes && (
              <div className="p-3 bg-surface-2/30 rounded-xl border border-border-default text-caption text-text-secondary">
                <span className="font-semibold text-text-primary block mb-0.5">Notes:</span>
                {selectedPurchase.notes}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
              <Button variant="outline" leftIcon={PrinterIcon} onClick={() => window.print()}>
                Print Record
              </Button>
              <Button variant="primary" onClick={() => setShowDetailModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
