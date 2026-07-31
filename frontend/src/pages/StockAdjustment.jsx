import React, { useState, useEffect } from 'react';
import {
  PencilSquareIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  TagIcon,
  ArchiveBoxIcon
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

export default function StockAdjustment() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [adjustments, setAdjustments] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [adjustType, setAdjustType] = useState('ADD');
  const [adjustQty, setAdjustQty] = useState('1');
  const [reason, setReason] = useState('Damaged Stock');
  const [submitting, setSubmitting] = useState(false);

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/products');
      const list = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.products)
            ? res.data.products
            : (Array.isArray(res.data?.rows) ? res.data.rows : []));
      setProducts(list);

      // Simulated initial log entries
      const sampleLogs = [
        {
          id: 'ADJ-2026-001',
          productName: 'Coca-Cola Soda 1.25L',
          sku: 'CC-1250ML',
          type: 'REMOVE',
          quantity: 4,
          reason: 'Broken bottle in warehouse',
          date: new Date(Date.now() - 86400000),
          performedBy: 'Store Admin'
        },
        {
          id: 'ADJ-2026-002',
          productName: 'Ungamill Premium Maize Flour 2kg',
          sku: 'UM-2KG',
          type: 'ADD',
          quantity: 20,
          reason: 'Audit reconciliation surplus',
          date: new Date(Date.now() - 86400000 * 3),
          performedBy: 'Store Admin'
        }
      ];

      setAdjustments(sampleLogs);
    } catch (err) {
      console.error('Failed to load adjustments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdjustments();
  }, []);

  const handleCreateAdjustment = async (e) => {
    e.preventDefault();
    if (!selectedProductId) {
      showToast({ type: 'error', title: 'Select Product', message: 'Please select a product.' });
      return;
    }
    const qty = parseInt(adjustQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast({ type: 'error', title: 'Invalid Quantity', message: 'Please enter a valid quantity.' });
      return;
    }

    setSubmitting(true);
    const p = products.find(prod => prod.id === parseInt(selectedProductId, 10) || prod.id === selectedProductId);

    try {
      const newStock = adjustType === 'ADD'
        ? (p.stockQuantity || 0) + qty
        : Math.max(0, (p.stockQuantity || 0) - qty);

      await api.put(`/api/products/${p.id}`, {
        ...p,
        stockQuantity: newStock,
        CategoryId: p.categoryId || p.CategoryId || p.Category?.id || 1
      });

      const newLog = {
        id: `ADJ-2026-${Math.floor(100 + Math.random() * 900)}`,
        productName: p.name,
        sku: p.sku,
        type: adjustType,
        quantity: qty,
        reason,
        date: new Date(),
        performedBy: 'Store Admin'
      };

      setAdjustments([newLog, ...adjustments]);
      showToast({ type: 'success', title: 'Adjustment Recorded', message: `Updated ${p.name} stock quantity.` });
      setShowModal(false);
      setSelectedProductId('');
      fetchAdjustments();
    } catch (err) {
      console.error('Failed to submit adjustment:', err);
      showToast({ type: 'error', title: 'Error', message: 'Failed to record adjustment.' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLogs = adjustments.filter(adj =>
    adj.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    adj.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    adj.reason.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Adjustment Log"
        description="Record manual inventory stock modifications, damaged items, and audit write-offs"
        action={
          <Button
            variant="primary"
            leftIcon={PlusIcon}
            onClick={() => setShowModal(true)}
          >
            New Adjustment
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full sm:w-auto">
            <Input
              type="search"
              placeholder="Search product or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>
          <Button variant="outline" size="sm" leftIcon={ArrowPathIcon} onClick={fetchAdjustments}>
            Refresh Log
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden border border-border-default">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-small">
            <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase border-b border-border-default">
              <tr>
                <th className="p-3.5">Log #</th>
                <th className="p-3.5">Product Name</th>
                <th className="p-3.5">SKU</th>
                <th className="p-3.5">Adjustment Type</th>
                <th className="p-3.5 text-center">Quantity</th>
                <th className="p-3.5">Reason</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-text-muted">Loading logs...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-text-muted">No stock adjustments logged.</td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-primary">{log.id}</td>
                    <td className="p-3.5 font-bold text-text-primary">{log.productName}</td>
                    <td className="p-3.5 font-mono text-text-secondary">{log.sku}</td>
                    <td className="p-3.5">
                      <Badge variant={log.type === 'ADD' ? 'success' : 'danger'}>
                        {log.type === 'ADD' ? '+ Addition' : '- Reduction'}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-center font-extrabold text-body">{log.quantity}</td>
                    <td className="p-3.5 text-text-secondary">{log.reason}</td>
                    <td className="p-3.5 text-text-secondary">
                      {log.date ? format(new Date(log.date), 'MMM dd, yyyy') : '—'}
                    </td>
                    <td className="p-3.5 text-caption font-mono text-text-muted">{log.performedBy}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Record Stock Adjustment"
        description="Manually adjust inventory count with justification note"
      >
        <form onSubmit={handleCreateAdjustment} className="space-y-4">
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select Inventory Product...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (Current Stock: {p.stockQuantity})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">Adjustment Type</label>
              <select
                value={adjustType}
                onChange={(e) => setAdjustType(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="ADD">Addition (+)</option>
                <option value="REMOVE">Reduction (-)</option>
              </select>
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">Quantity Count</label>
              <input
                type="number"
                min="1"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30 font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            >
              <option value="Damaged Stock">Damaged Stock / Broken</option>
              <option value="Expired Goods">Expired Goods</option>
              <option value="Audit Discrepancy">Audit Discrepancy Reconciliation</option>
              <option value="Inventory Restock">Inventory Restock Adjustment</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Submit Adjustment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
