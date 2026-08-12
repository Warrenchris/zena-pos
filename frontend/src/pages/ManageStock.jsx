import React, { useState, useEffect } from 'react';
import {
  ArchiveBoxIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  BanknotesIcon,
  PlusIcon,
  MinusIcon
} from '@heroicons/react/24/outline';
import { useSelector } from 'react-redux';
import { selectSettings } from '../store/slices/settingsSlice';
import api from '../services/api';
import useCurrency from '../hooks/useCurrency';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import { useToast } from '../components/Toast';

export default function ManageStock() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();
  const settings = useSelector(selectSettings);
  const defaultLowStock = settings?.lowStockThreshold !== undefined ? settings.lowStockThreshold : 10;

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL');

  // Stock Adjustment Modal State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState('ADD'); // 'ADD' | 'REMOVE' | 'SET'
  const [adjustQty, setAdjustQty] = useState('10');
  const [reason, setReason] = useState('Manual Inventory Audit');
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/products');
      const list = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.products)
            ? res.data.products
            : (Array.isArray(res.data?.rows) ? res.data.rows : []));
      setProducts(list);
    } catch (err) {
      console.error('Error fetching inventory stock:', err);
      showToast({ type: 'error', title: 'Error', message: 'Failed to load inventory stock.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const getEffectiveReorder = (p) => {
    if (p.reorderPoint !== null && p.reorderPoint !== undefined && p.reorderPoint !== '') {
      return parseInt(p.reorderPoint, 10);
    }
    return defaultLowStock;
  };

  const handleOpenAdjustModal = (product) => {
    setSelectedProduct(product);
    setAdjustmentType('ADD');
    setAdjustQty('10');
    setReason('Manual Inventory Audit');
    setShowAdjustModal(true);
  };

  const handleSaveStockAdjustment = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const qty = parseInt(adjustQty, 10);
    if (isNaN(qty) || qty < 0) {
      showToast({ type: 'error', title: 'Invalid Quantity', message: 'Please enter a valid positive quantity.' });
      return;
    }

    let newStock = selectedProduct.stockQuantity;
    if (adjustmentType === 'ADD') {
      newStock += qty;
    } else if (adjustmentType === 'REMOVE') {
      newStock = Math.max(0, newStock - qty);
    } else if (adjustmentType === 'SET') {
      newStock = qty;
    }

    setSubmitting(true);
    try {
      await api.put(`/api/products/${selectedProduct.id}`, {
        ...selectedProduct,
        stockQuantity: newStock,
        categoryId: selectedProduct.categoryId || selectedProduct.CategoryId || selectedProduct.Category?.id || 1,
        CategoryId: selectedProduct.categoryId || selectedProduct.CategoryId || selectedProduct.Category?.id || 1
      });

      showToast({
        type: 'success',
        title: 'Stock Updated',
        message: `Updated stock for ${selectedProduct.name} to ${newStock} units (${reason}).`
      });

      setShowAdjustModal(false);
      fetchProducts();
    } catch (err) {
      console.error('Failed to update stock:', err);
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.error || 'Failed to update stock quantity.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Products
  const filteredProducts = (Array.isArray(products) ? products : []).filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (stockFilter === 'LOW') {
      return (p.stockQuantity || 0) <= (p.reorderPoint || 5) && (p.stockQuantity || 0) > 0;
    }
    if (stockFilter === 'OUT') {
      return (p.stockQuantity || 0) === 0;
    }
    if (stockFilter === 'IN_STOCK') {
      return (p.stockQuantity || 0) > (p.reorderPoint || 5);
    }
    return true;
  });

  // Summary Metrics
  const totalItemsCount = (Array.isArray(products) ? products : []).reduce((s, p) => s + (parseInt(p.stockQuantity, 10) || 0), 0);
  const lowStockCount = (Array.isArray(products) ? products : []).filter(p => (p.stockQuantity || 0) <= (p.reorderPoint || 5) && (p.stockQuantity || 0) > 0).length;
  const outOfStockCount = (Array.isArray(products) ? products : []).filter(p => (p.stockQuantity || 0) === 0).length;
  const totalValueSum = (Array.isArray(products) ? products : []).reduce((s, p) => s + ((p.stockQuantity || 0) * (p.cost || p.price || 0)), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Stock & Inventory Control"
        description="Monitor real-time stock levels, low-stock threshold warnings, and execute manual adjustments"
        action={
          <Button
            variant="outline"
            leftIcon={ArrowPathIcon}
            onClick={fetchProducts}
          >
            Refresh Stock Data
          </Button>
        }
      />

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <ArchiveBoxIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Total Inventory Stock</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{totalItemsCount.toLocaleString()} units</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-warning/10 text-warning">
            <ExclamationTriangleIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Low Stock Warnings</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{lowStockCount} items</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-danger/10 text-danger">
            <XCircleIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Out of Stock</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{outOfStockCount} items</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-success/10 text-success">
            <BanknotesIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Valuation Total</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{formatCurrency(totalValueSum)}</p>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full sm:w-auto">
            <Input
              type="search"
              placeholder="Search product name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>

          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-surface border border-border-default text-text-primary text-caption font-semibold focus:ring-2 focus:ring-primary/30"
            >
              <option value="ALL">All Stock Levels</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="LOW">Low Stock Alerts</option>
              <option value="OUT">Out of Stock</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="overflow-hidden border border-border-default">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-small">
            <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
              <tr>
                <th className="p-3.5">SKU / Code</th>
                <th className="p-3.5">Product Name</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5 text-right">Unit Cost</th>
                <th className="p-3.5 text-right">Price</th>
                <th className="p-3.5 text-center">Stock Quantity</th>
                <th className="p-3.5 text-center">Reorder Point</th>
                <th className="p-3.5 text-center">Stock Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-text-muted">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    Loading inventory stock...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-text-muted">
                    No products found matching stock filter.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const stock = parseInt(product.stockQuantity || 0, 10);
                  const reorder = getEffectiveReorder(product);
                  const isOut = stock === 0;
                  const isLow = stock <= reorder && stock > 0;

                  return (
                    <tr key={product.id} className="hover:bg-surface-2/40 transition-colors">
                      <td className="p-3.5 font-mono font-semibold text-primary">{product.sku}</td>
                      <td className="p-3.5 font-bold text-text-primary">{product.name}</td>
                      <td className="p-3.5 text-text-secondary">{product.Category?.name || 'General'}</td>
                      <td className="p-3.5 text-right text-text-secondary">{formatCurrency(product.cost || 0)}</td>
                      <td className="p-3.5 text-right font-semibold text-text-primary">{formatCurrency(product.price || 0)}</td>
                      <td className="p-3.5 text-center font-bold text-h4">
                        <span className={isOut ? 'text-danger font-extrabold' : isLow ? 'text-warning font-extrabold' : 'text-text-primary'}>
                          {stock}
                        </span>
                      </td>
                      <td className="p-3.5 text-center text-text-muted">{reorder}</td>
                      <td className="p-3.5 text-center">
                        {isOut ? (
                          <Badge variant="danger">Out of Stock</Badge>
                        ) : isLow ? (
                          <Badge variant="warning">Low Stock</Badge>
                        ) : (
                          <Badge variant="success">In Stock</Badge>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={PencilSquareIcon}
                          onClick={() => handleOpenAdjustModal(product)}
                        >
                          Adjust Stock
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* QUICK STOCK ADJUSTMENT MODAL */}
      {selectedProduct && (
        <Modal
          isOpen={showAdjustModal}
          onClose={() => setShowAdjustModal(false)}
          title={`Adjust Stock: ${selectedProduct.name}`}
          description={`Current Stock: ${selectedProduct.stockQuantity} units (SKU: ${selectedProduct.sku})`}
        >
          <form onSubmit={handleSaveStockAdjustment} className="space-y-4">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Adjustment Action
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustmentType('ADD')}
                  className={`p-2.5 rounded-xl border text-caption font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    adjustmentType === 'ADD'
                      ? 'bg-success/15 border-success text-success'
                      : 'bg-surface border-border-default text-text-secondary'
                  }`}
                >
                  <PlusIcon className="h-4 w-4" /> Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentType('REMOVE')}
                  className={`p-2.5 rounded-xl border text-caption font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    adjustmentType === 'REMOVE'
                      ? 'bg-danger/15 border-danger text-danger'
                      : 'bg-surface border-border-default text-text-secondary'
                  }`}
                >
                  <MinusIcon className="h-4 w-4" /> Remove Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentType('SET')}
                  className={`p-2.5 rounded-xl border text-caption font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    adjustmentType === 'SET'
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-surface border-border-default text-text-secondary'
                  }`}
                >
                  Set Absolute
                </button>
              </div>
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Quantity Count
              </label>
              <input
                type="number"
                min="0"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-body font-bold focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Reason for Adjustment
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="Manual Inventory Audit">Manual Inventory Audit</option>
                <option value="Supplier Delivery Restock">Supplier Delivery Restock</option>
                <option value="Damaged / Expired Product">Damaged / Expired Product</option>
                <option value="Theft or Loss Discrepancy">Theft or Loss Discrepancy</option>
              </select>
            </div>

            <div className="p-3 bg-surface-2/40 border border-border-default rounded-xl flex justify-between items-center text-small">
              <span className="text-text-muted">Calculated New Stock Count:</span>
              <span className="text-h3 font-extrabold text-primary">
                {adjustmentType === 'ADD'
                  ? selectedProduct.stockQuantity + (parseInt(adjustQty, 10) || 0)
                  : adjustmentType === 'REMOVE'
                  ? Math.max(0, selectedProduct.stockQuantity - (parseInt(adjustQty, 10) || 0))
                  : (parseInt(adjustQty, 10) || 0)} units
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
              <Button type="button" variant="outline" onClick={() => setShowAdjustModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                Save Stock Adjustment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
