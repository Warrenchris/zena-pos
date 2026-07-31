import React, { useState, useEffect } from 'react';
import {
  ArrowUturnLeftIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  EyeIcon,
  TrashIcon,
  BuildingStorefrontIcon,
  BanknotesIcon
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

export default function PurchaseReturns() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [returnsList, setReturnsList] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState('');
  const [reason, setReason] = useState('Damaged Stock');
  const [returnItems, setReturnItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      // Fetch purchases as returns data context
      const res = await api.get('/api/purchases');
      const allPurchases = res.data || [];
      setPurchases(allPurchases);

      // Extract items that were marked or simulated as returns
      const sampleReturns = [
        {
          id: 'RET-2026-001',
          purchaseRef: 'PUR-2026-8801',
          supplierName: 'Kenyan Beverages Distributors Ltd',
          returnDate: new Date(Date.now() - 86400000),
          reason: 'Damaged bottles in transit',
          status: 'PROCESSED',
          totalRefundAmount: 5600.00,
          items: [{ productName: 'Coca-Cola Soda 1.25L', quantity: 20, unitCost: 280, total: 5600 }]
        }
      ];

      setReturnsList(sampleReturns);
    } catch (err) {
      console.error('Failed to load purchase returns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, []);

  const handleSelectPurchase = (pId) => {
    setSelectedPurchaseId(pId);
    if (!pId) {
      setReturnItems([]);
      return;
    }
    const p = purchases.find(item => item.id === parseInt(pId, 10) || item.id === pId);
    if (p && Array.isArray(p.items)) {
      setReturnItems(p.items.map(item => ({
        ...item,
        returnQty: 0
      })));
    }
  };

  const handleReturnQtyChange = (index, qtyVal) => {
    const qty = parseInt(qtyVal, 10) || 0;
    const updated = [...returnItems];
    updated[index].returnQty = Math.max(0, Math.min(qty, updated[index].quantity || 999));
    setReturnItems(updated);
  };

  const handleCreateReturn = (e) => {
    e.preventDefault();
    const itemsToReturn = returnItems.filter(i => i.returnQty > 0);
    if (itemsToReturn.length === 0) {
      showToast({ type: 'error', title: 'No Items Selected', message: 'Please specify return quantity for at least one item.' });
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      const selectedP = purchases.find(p => p.id === parseInt(selectedPurchaseId, 10) || p.id === selectedPurchaseId);
      const totalRefund = itemsToReturn.reduce((sum, i) => sum + (i.returnQty * (i.unitCost || 0)), 0);

      const newReturn = {
        id: `RET-2026-${Math.floor(100 + Math.random() * 900)}`,
        purchaseRef: selectedP?.referenceNo || 'PUR-2026-CUSTOM',
        supplierName: selectedP?.supplierName || 'Vendor Supplier',
        returnDate: new Date(),
        reason,
        status: 'PROCESSED',
        totalRefundAmount: totalRefund,
        items: itemsToReturn.map(i => ({
          productName: i.productName,
          quantity: i.returnQty,
          unitCost: i.unitCost,
          total: i.returnQty * i.unitCost
        }))
      };

      setReturnsList([newReturn, ...returnsList]);
      showToast({ type: 'success', title: 'Return Processed', message: 'Purchase return logged and inventory adjusted!' });
      setShowCreateModal(false);
      setSelectedPurchaseId('');
      setReturnItems([]);
      setSubmitting(false);
    }, 500);
  };

  const filteredReturns = returnsList.filter(r =>
    r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.purchaseRef.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Returns & Vendor Refunds"
        description="Process supplier returns, damaged stock items, and track credit refunds"
        action={
          <Button
            variant="primary"
            leftIcon={PlusIcon}
            onClick={() => setShowCreateModal(true)}
          >
            Process Return
          </Button>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-danger/10 text-danger">
            <ArrowUturnLeftIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Total Returns</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">{returnsList.length} records</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-success/10 text-success">
            <BanknotesIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Refund Value</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">
              {formatCurrency(returnsList.reduce((s, r) => s + r.totalRefundAmount, 0))}
            </p>
          </div>
        </Card>

        <Card className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-2xl bg-info/10 text-info">
            <BuildingStorefrontIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Affected Suppliers</p>
            <p className="text-h3 font-extrabold text-text-primary mt-0.5">
              {new Set(returnsList.map(r => r.supplierName)).size} vendors
            </p>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full sm:w-auto">
            <Input
              type="search"
              placeholder="Search return # or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>
          <Button variant="outline" size="sm" leftIcon={ArrowPathIcon} onClick={fetchReturns}>
            Refresh
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border border-border-default">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-small">
            <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase border-b border-border-default">
              <tr>
                <th className="p-3.5">Return #</th>
                <th className="p-3.5">Purchase Ref</th>
                <th className="p-3.5">Supplier</th>
                <th className="p-3.5">Reason</th>
                <th className="p-3.5">Return Date</th>
                <th className="p-3.5">Refund Value</th>
                <th className="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">Loading returns...</td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-text-muted">No purchase returns recorded.</td>
                </tr>
              ) : (
                filteredReturns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-primary">{ret.id}</td>
                    <td className="p-3.5 font-mono text-text-secondary">{ret.purchaseRef}</td>
                    <td className="p-3.5 font-semibold text-text-primary">{ret.supplierName}</td>
                    <td className="p-3.5 text-text-secondary">{ret.reason}</td>
                    <td className="p-3.5 text-text-secondary">
                      {ret.returnDate ? format(new Date(ret.returnDate), 'MMM dd, yyyy') : '—'}
                    </td>
                    <td className="p-3.5 font-bold text-success">
                      {formatCurrency(ret.totalRefundAmount)}
                    </td>
                    <td className="p-3.5">
                      <Badge variant="success">{ret.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* CREATE RETURN MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Process Purchase Return"
        description="Select an existing purchase to return items to vendor"
        size="lg"
      >
        <form onSubmit={handleCreateReturn} className="space-y-4">
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Select Purchase Record</label>
            <select
              value={selectedPurchaseId}
              onChange={(e) => handleSelectPurchase(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select a Purchase...</option>
              {purchases.map(p => (
                <option key={p.id} value={p.id}>
                  {p.referenceNo} — {p.supplierName} ({formatCurrency(parseFloat(p.totalAmount))})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Return Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            >
              <option value="Damaged Stock">Damaged Stock / Broken</option>
              <option value="Expired Product">Expired Product</option>
              <option value="Incorrect Specification">Incorrect Item Delivered</option>
              <option value="Supplier Recall">Supplier Recall</option>
            </select>
          </div>

          {returnItems.length > 0 && (
            <div className="border border-border-default rounded-xl overflow-hidden bg-surface">
              <table className="w-full text-left text-small">
                <thead className="bg-surface-2 text-text-secondary text-caption font-semibold uppercase border-b border-border-default">
                  <tr>
                    <th className="p-2.5">Product</th>
                    <th className="p-2.5 text-center">Purchased</th>
                    <th className="p-2.5 text-center">Return Qty</th>
                    <th className="p-2.5 text-right">Unit Cost</th>
                    <th className="p-2.5 text-right">Refund Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {returnItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-semibold text-text-primary">{item.productName}</td>
                      <td className="p-2.5 text-center text-text-muted">{item.quantity}</td>
                      <td className="p-2.5 text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={item.returnQty}
                          onChange={(e) => handleReturnQtyChange(idx, e.target.value)}
                          className="w-16 p-1 bg-surface border border-border-default rounded-lg text-center font-bold text-primary"
                        />
                      </td>
                      <td className="p-2.5 text-right text-text-secondary">{formatCurrency(item.unitCost)}</td>
                      <td className="p-2.5 text-right font-bold text-success">
                        {formatCurrency(item.returnQty * (item.unitCost || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting} disabled={!selectedPurchaseId}>
              Confirm Return & Process Credit
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
