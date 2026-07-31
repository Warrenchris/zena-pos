import React, { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [fromLocation, setFromLocation] = useState('Main Warehouse');
  const [toLocation, setToLocation] = useState('Westlands Branch');
  const [transferQty, setTransferQty] = useState('10');
  const [submitting, setSubmitting] = useState(false);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/products');
      const list = Array.isArray(res.data)
        ? res.data
        : (Array.isArray(res.data?.products)
            ? res.data.products
            : (Array.isArray(res.data?.rows) ? res.data.rows : []));
      setProducts(list);

      const sampleTransfers = [
        {
          id: 'TRF-2026-101',
          productName: 'Coca-Cola Soda 1.25L',
          sku: 'CC-1250ML',
          quantity: 50,
          fromLocation: 'Main Warehouse',
          toLocation: 'Westlands Branch',
          date: new Date(Date.now() - 86400000 * 2),
          status: 'COMPLETED'
        },
        {
          id: 'TRF-2026-102',
          productName: 'Safari Lager Beer 500ml',
          sku: 'SL-500ML',
          quantity: 30,
          fromLocation: 'Central Depot',
          toLocation: 'Mombasa Road Outlet',
          date: new Date(Date.now() - 86400000 * 4),
          status: 'COMPLETED'
        }
      ];

      setTransfers(sampleTransfers);
    } catch (err) {
      console.error('Failed to fetch stock transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  const handleCreateTransfer = (e) => {
    e.preventDefault();
    if (!selectedProductId) {
      showToast({ type: 'error', title: 'Select Product', message: 'Please select a product to transfer.' });
      return;
    }
    const qty = parseInt(transferQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast({ type: 'error', title: 'Invalid Quantity', message: 'Please enter a valid transfer quantity.' });
      return;
    }

    setSubmitting(true);
    const p = products.find(prod => prod.id === parseInt(selectedProductId, 10) || prod.id === selectedProductId);

    setTimeout(() => {
      const newTransfer = {
        id: `TRF-2026-${Math.floor(100 + Math.random() * 900)}`,
        productName: p?.name || 'Transferred Item',
        sku: p?.sku || '',
        quantity: qty,
        fromLocation,
        toLocation,
        date: new Date(),
        status: 'COMPLETED'
      };

      setTransfers([newTransfer, ...transfers]);
      showToast({ type: 'success', title: 'Stock Transfer Logged', message: `Transferred ${qty} units of ${p?.name || 'product'}.` });
      setShowModal(false);
      setSelectedProductId('');
      setSubmitting(false);
    }, 400);
  };

  const filteredTransfers = transfers.filter(trf =>
    trf.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trf.fromLocation.toLowerCase().includes(searchQuery.toLowerCase()) ||
    trf.toLocation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inter-Location Stock Transfer"
        description="Track and record movement of product inventory between warehouses and store branches"
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
              placeholder="Search product or branch location..."
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
                    <td className="p-3.5 font-bold font-mono text-primary">{trf.id}</td>
                    <td className="p-3.5 font-bold text-text-primary">{trf.productName}</td>
                    <td className="p-3.5 font-mono text-text-secondary">{trf.sku}</td>
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
        description="Transfer product items between store locations or warehouses"
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4">
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
                  {p.name} (Available: {p.stockQuantity})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">From Location</label>
              <input
                type="text"
                required
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">To Destination</label>
              <input
                type="text"
                required
                value={toLocation}
                onChange={(e) => setToLocation(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label className="block text-caption font-semibold text-text-secondary mb-1">Transfer Quantity</label>
            <input
              type="number"
              min="1"
              required
              value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30 font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border-default">
            <Button variant="outline" onClick={() => setShowModal(false)}>
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
