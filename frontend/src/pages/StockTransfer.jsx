import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowsRightLeftIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  BuildingStorefrontIcon
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

export default function StockTransfer() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [fromShopId, setFromShopId] = useState('');
  const [toShopId, setToShopId] = useState('');
  const [transferQty, setTransferQty] = useState('10');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchShops = async () => {
    try {
      const res = await api.get('/api/shop/accessible');
      const list = Array.isArray(res.data) ? res.data : (res.data?.shops || []);
      setShops(list);
      if (list.length > 0) {
        const currentShop = list.find(s => s.isCurrent) || list[0];
        setFromShopId(String(currentShop.id));
        const otherShop = list.find(s => s.id !== currentShop.id);
        if (otherShop) {
          setToShopId(String(otherShop.id));
        }
      }
    } catch (err) {
      console.error('Failed to load accessible shops:', err);
    }
  };

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const [prodRes, trfRes] = await Promise.all([
        api.get('/api/products?pageSize=100'),
        api.get('/api/transfers?pageSize=100')
      ]);

      const list = Array.isArray(prodRes.data)
        ? prodRes.data
        : (Array.isArray(prodRes.data?.products)
            ? prodRes.data.products
            : (Array.isArray(prodRes.data?.rows) ? prodRes.data.rows : []));
      setProducts(list);

      const rawMovements = Array.isArray(trfRes.data)
        ? trfRes.data
        : (trfRes.data?.transfers || []);

      // Group paired movements by transfer reference
      const grouped = {};
      rawMovements.forEach(m => {
        const ref = m.reference || `TRF-${m.id}`;
        if (!grouped[ref]) {
          grouped[ref] = {
            id: ref,
            reference: ref,
            productName: m.product?.name || `Product #${m.productId}`,
            sku: m.product?.sku || '',
            quantity: Math.abs(parseFloat(m.quantity || 0)),
            fromLocation: '—',
            toLocation: '—',
            date: m.createdAt,
            status: 'COMPLETED',
            notes: m.notes
          };
        }
        if (parseFloat(m.quantity) < 0) {
          grouped[ref].fromLocation = m.Shop?.name || `Shop #${m.shopId}`;
        } else {
          grouped[ref].toLocation = m.Shop?.name || `Shop #${m.shopId}`;
        }
      });

      setTransfers(Object.values(grouped));
    } catch (err) {
      console.error('Failed to fetch stock transfers:', err);
      showToast({ type: 'error', title: 'Fetch Failed', message: 'Unable to load transfer history.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
    fetchTransfers();
  }, []);

  const selectedProduct = useMemo(() => {
    return products.find(p => String(p.id) === String(selectedProductId));
  }, [products, selectedProductId]);

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    if (!selectedProductId) {
      showToast({ type: 'error', title: 'Select Product', message: 'Please select a product to transfer.' });
      return;
    }

    if (!fromShopId || !toShopId) {
      showToast({ type: 'error', title: 'Select Branches', message: 'Please select both source and destination branches.' });
      return;
    }

    if (fromShopId === toShopId) {
      showToast({ type: 'error', title: 'Invalid Selection', message: 'Source and destination branches must be different.' });
      return;
    }

    const qty = parseFloat(transferQty);
    if (isNaN(qty) || qty <= 0) {
      showToast({ type: 'error', title: 'Invalid Quantity', message: 'Please enter a valid positive transfer quantity.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/transfers', {
        sourceShopId: parseInt(fromShopId, 10),
        destinationShopId: parseInt(toShopId, 10),
        productId: parseInt(selectedProductId, 10),
        quantity: qty,
        notes: notes.trim() || undefined
      });

      showToast({
        type: 'success',
        title: 'Transfer Complete',
        message: `Successfully transferred ${qty} units of ${res.data.productName || 'product'} (Ref: ${res.data.reference}).`
      });

      setShowModal(false);
      setSelectedProductId('');
      setNotes('');
      fetchTransfers();
    } catch (err) {
      console.error('Transfer failed:', err);
      showToast({
        type: 'error',
        title: 'Transfer Failed',
        message: err.response?.data?.error || 'Failed to complete stock transfer.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTransfers = transfers.filter(trf =>
    (trf.productName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (trf.fromLocation || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (trf.toLocation || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (trf.reference || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inter-Location Stock Transfer"
        description="Track and record movement of product inventory between store branches"
        action={
          <Button
            variant="primary"
            leftIcon={PlusIcon}
            onClick={() => setShowModal(true)}
          >
            New Transfer
          </Button>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full sm:w-auto">
            <Input
              type="search"
              placeholder="Search by product, branch, or transfer ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>
          <Button variant="outline" size="sm" leftIcon={ArrowPathIcon} onClick={fetchTransfers}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden border border-border-default">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-small">
            <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase border-b border-border-default">
              <tr>
                <th className="p-3.5">Transfer #</th>
                <th className="p-3.5">Product Name</th>
                <th className="p-3.5">SKU</th>
                <th className="p-3.5">From Origin</th>
                <th className="p-3.5">To Destination</th>
                <th className="p-3.5 text-center">Transferred Qty</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-text-muted">Loading transfers...</td>
                </tr>
              ) : filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-text-muted">No stock transfers recorded.</td>
                </tr>
              ) : (
                filteredTransfers.map(trf => (
                  <tr key={trf.id} className="hover:bg-surface-2/40 transition-colors">
                    <td className="p-3.5 font-bold font-mono text-primary">{trf.reference || trf.id}</td>
                    <td className="p-3.5 font-bold text-text-primary">{trf.productName}</td>
                    <td className="p-3.5 font-mono text-text-secondary">{trf.sku || '—'}</td>
                    <td className="p-3.5 text-text-secondary">{trf.fromLocation}</td>
                    <td className="p-3.5 font-semibold text-text-primary">{trf.toLocation}</td>
                    <td className="p-3.5 text-center font-extrabold text-body text-primary">{trf.quantity}</td>
                    <td className="p-3.5 text-text-secondary">
                      {trf.date ? format(new Date(trf.date), 'MMM dd, yyyy') : '—'}
                    </td>
                    <td className="p-3.5">
                      <Badge variant="success">{trf.status}</Badge>
                    </td>
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
        title="Create Stock Transfer"
        description="Transfer inventory between branches under your organization"
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4">
          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Select Inventory Product...</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} (Current Branch Stock: {p.stockQuantity !== undefined ? p.stockQuantity : '—'})
                </option>
              ))}
            </select>
            {selectedProduct && (
              <p className="text-caption text-text-muted mt-1">
                SKU: <span className="font-mono text-text-primary">{selectedProduct.sku}</span> | Available: <span className="font-semibold text-primary">{selectedProduct.stockQuantity}</span> units
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">From Origin Branch *</label>
              <select
                required
                value={fromShopId}
                onChange={(e) => setFromShopId(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select Origin...</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isCurrent ? '(Current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">To Destination Branch *</label>
              <select
                required
                value={toShopId}
                onChange={(e) => setToShopId(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Select Destination...</option>
                {shops.map(s => (
                  <option key={s.id} value={s.id} disabled={String(s.id) === String(fromShopId)}>
                    {s.name} {String(s.id) === String(fromShopId) ? '(Source)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Transfer Quantity *</label>
            <input
              type="number"
              min="1"
              required
              value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30 font-bold"
            />
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Notes / Reason (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Stock balancing, rush customer order"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              Execute Transfer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

