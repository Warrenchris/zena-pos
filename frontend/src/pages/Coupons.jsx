import React, { useState, useEffect, useMemo } from 'react';
import {
  TicketIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  TrashIcon,
  PencilSquareIcon,
  SparklesIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import { format, isAfter, isBefore } from 'date-fns';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../components/Toast';
import { couponsAPI } from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Spinner from '../components/ui/Spinner';

// Initial fallback coupons
const DEFAULT_COUPONS = [
  {
    id: '1',
    code: 'WELCOME10',
    title: 'Welcome New Customer',
    discountType: 'percentage',
    discountValue: 10,
    minSpend: 500,
    maxDiscount: 200,
    usageLimit: 100,
    usedCount: 24,
    perUserLimit: 1,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isActive: true,
    description: '10% discount for first-time shoppers on orders over KSh 500.'
  },
  {
    id: '2',
    code: 'EASTER500',
    title: 'Easter Festival Discount',
    discountType: 'fixed',
    discountValue: 500,
    minSpend: 2500,
    maxDiscount: 500,
    usageLimit: 50,
    usedCount: 41,
    perUserLimit: 2,
    startDate: '2026-04-01',
    endDate: '2026-08-15',
    isActive: true,
    description: 'Save KSh 500 flat on holiday purchases over KSh 2,500.'
  },
  {
    id: '3',
    code: 'VIPREWARD',
    title: 'VIP Platinum Member Voucher',
    discountType: 'percentage',
    discountValue: 20,
    minSpend: 1000,
    maxDiscount: 1000,
    usageLimit: 30,
    usedCount: 30,
    perUserLimit: 1,
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    isActive: false,
    description: 'Exclusive 20% off for platinum tier loyalty members.'
  }
];

export default function Coupons() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [copiedCode, setCopiedCode] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    title: '',
    discountType: 'percentage',
    discountValue: 10,
    minSpend: 0,
    maxDiscount: '',
    usageLimit: 100,
    perUserLimit: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    isActive: true,
    description: ''
  });

  // Fetch Coupons from backend
  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await couponsAPI.getAll();
      const list = Array.isArray(res.data) ? res.data : [];
      if (list.length > 0) {
        setCoupons(list);
      } else {
        const saved = localStorage.getItem('zana_pos_coupons');
        setCoupons(saved ? JSON.parse(saved) : DEFAULT_COUPONS);
      }
    } catch (err) {
      console.warn('API error fetching coupons, falling back to local state:', err);
      const saved = localStorage.getItem('zana_pos_coupons');
      setCoupons(saved ? JSON.parse(saved) : DEFAULT_COUPONS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  // Sync to local storage for backup
  useEffect(() => {
    try {
      if (coupons.length > 0) {
        localStorage.setItem('zana_pos_coupons', JSON.stringify(coupons));
      }
    } catch {}
  }, [coupons]);

  // Helper to determine coupon status
  const getCouponStatus = (coupon) => {
    if (!coupon.isActive) return 'disabled';
    const now = new Date();
    if (coupon.endDate && isAfter(now, new Date(coupon.endDate + 'T23:59:59'))) return 'expired';
    if (coupon.startDate && isBefore(now, new Date(coupon.startDate + 'T00:00:00'))) return 'scheduled';
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return 'exhausted';
    return 'active';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'scheduled':
        return <Badge variant="warning">Scheduled</Badge>;
      case 'expired':
        return <Badge variant="danger">Expired</Badge>;
      case 'exhausted':
        return <Badge variant="neutral">Fully Redeemed</Badge>;
      case 'disabled':
      default:
        return <Badge variant="neutral">Inactive</Badge>;
    }
  };

  // Copy code handler
  const handleCopyCode = (code, e) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    showToast('success', `Coupon code "${code}" copied to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Generate random code
  const handleGenerateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'SAVE';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, code: result }));
  };

  // Open create modal
  const handleOpenCreateModal = () => {
    setEditingCoupon(null);
    setFormData({
      code: '',
      title: '',
      discountType: 'percentage',
      discountValue: 15,
      minSpend: 500,
      maxDiscount: 500,
      usageLimit: 100,
      perUserLimit: 1,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isActive: true,
      description: ''
    });
    handleGenerateCode();
    setShowModal(true);
  };

  // Open edit modal
  const handleOpenEditModal = (coupon, e) => {
    if (e) e.stopPropagation();
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      title: coupon.title,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minSpend: coupon.minSpend || 0,
      maxDiscount: coupon.maxDiscount || '',
      usageLimit: coupon.usageLimit || 100,
      perUserLimit: coupon.perUserLimit || 1,
      startDate: coupon.startDate || '',
      endDate: coupon.endDate || '',
      isActive: coupon.isActive,
      description: coupon.description || ''
    });
    setShowModal(true);
  };

  // Toggle active status
  const handleToggleStatus = async (coupon, e) => {
    if (e) e.stopPropagation();
    const updatedStatus = !coupon.isActive;
    try {
      if (typeof coupon.id === 'number' || !String(coupon.id).startsWith('1')) {
        await couponsAPI.update(coupon.id, { isActive: updatedStatus });
      }
    } catch (err) {
      console.warn('API update error:', err);
    }
    setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, isActive: updatedStatus } : c));
    showToast('info', `Coupon "${coupon.code}" ${updatedStatus ? 'activated' : 'deactivated'}.`);
  };

  // Delete coupon
  const handleDeleteCoupon = async (id, code, e) => {
    if (e) e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete coupon code "${code}"?`)) {
      try {
        await couponsAPI.delete(id);
      } catch (err) {
        console.warn('API delete error:', err);
      }
      setCoupons(prev => prev.filter(c => c.id !== id));
      showToast('success', `Coupon "${code}" deleted successfully.`);
    }
  };

  // Save coupon
  const handleSaveCoupon = async (e) => {
    e.preventDefault();

    if (!formData.code.trim()) {
      showToast('error', 'Coupon code is required.');
      return;
    }

    if (!formData.title.trim()) {
      showToast('error', 'Coupon title is required.');
      return;
    }

    const payload = {
      code: formData.code.trim().toUpperCase(),
      title: formData.title.trim(),
      discountType: formData.discountType,
      discountValue: Number(formData.discountValue) || 0,
      minSpend: Number(formData.minSpend) || 0,
      maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : null,
      usageLimit: Number(formData.usageLimit) || 100,
      perUserLimit: Number(formData.perUserLimit) || 1,
      startDate: formData.startDate || null,
      endDate: formData.endDate || null,
      isActive: formData.isActive,
      description: formData.description.trim()
    };

    setSubmitting(true);
    try {
      if (editingCoupon) {
        let updatedItem = { ...editingCoupon, ...payload };
        try {
          const res = await couponsAPI.update(editingCoupon.id, payload);
          if (res.data) updatedItem = res.data;
        } catch (err) {
          console.warn('Backend API update failed, using local update:', err);
        }
        setCoupons(prev => prev.map(c => c.id === editingCoupon.id ? updatedItem : c));
        showToast('success', `Coupon "${payload.code}" updated successfully!`);
      } else {
        let newItem = { id: String(Date.now()), usedCount: 0, ...payload };
        try {
          const res = await couponsAPI.create(payload);
          if (res.data) newItem = res.data;
        } catch (err) {
          console.warn('Backend API create failed, saving locally:', err);
        }
        setCoupons(prev => [newItem, ...prev]);
        showToast('success', `New coupon "${payload.code}" created successfully!`);
      }
      setShowModal(false);
    } catch (err) {
      showToast('error', 'Failed to save coupon: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Coupons
  const filteredCoupons = useMemo(() => {
    return coupons.filter(c => {
      const status = getCouponStatus(c);
      const matchesSearch =
        c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all' || status === filterStatus;
      const matchesType = filterType === 'all' || c.discountType === filterType;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [coupons, searchTerm, filterStatus, filterType]);

  // Statistics
  const stats = useMemo(() => {
    const total = coupons.length;
    const active = coupons.filter(c => getCouponStatus(c) === 'active').length;
    const expired = coupons.filter(c => ['expired', 'exhausted'].includes(getCouponStatus(c))).length;
    const totalRedeemed = coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0);

    return { total, active, expired, totalRedeemed };
  }, [coupons]);

  // Columns
  const columns = [
    {
      key: 'code',
      label: 'Coupon Code',
      render: (val) => (
        <div className="flex items-center space-x-2">
          <span className="font-mono font-bold tracking-wider px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
            {val}
          </span>
          <button
            type="button"
            onClick={(e) => handleCopyCode(val, e)}
            className="p-1 text-text-muted hover:text-primary transition-colors"
            title="Copy Code"
          >
            {copiedCode === val ? (
              <CheckIcon className="h-4 w-4 text-success" />
            ) : (
              <ClipboardDocumentIcon className="h-4 w-4" />
            )}
          </button>
        </div>
      )
    },
    {
      key: 'title',
      label: 'Campaign Title',
      render: (val, row) => (
        <div>
          <p className="font-semibold text-text-primary">{val}</p>
          <p className="text-caption text-text-muted truncate max-w-xs">{row.description || 'No description'}</p>
        </div>
      )
    },
    {
      key: 'discountValue',
      label: 'Discount',
      render: (_, row) => (
        <span className="font-bold text-success text-body">
          {row.discountType === 'percentage'
            ? `${row.discountValue}% OFF`
            : `${formatCurrency(row.discountValue)} OFF`}
        </span>
      )
    },
    {
      key: 'minSpend',
      label: 'Min Spend',
      render: (val) => (
        <span className="text-small text-text-secondary">
          {val > 0 ? formatCurrency(val) : 'No Minimum'}
        </span>
      )
    },
    {
      key: 'usageLimit',
      label: 'Redemptions',
      render: (_, row) => {
        const percent = Math.min(100, Math.round(((row.usedCount || 0) / (row.usageLimit || 1)) * 100));
        return (
          <div className="w-32">
            <div className="flex justify-between text-caption text-text-muted mb-1 font-medium">
              <span>{row.usedCount || 0} / {row.usageLimit || '∞'}</span>
              <span>{percent}%</span>
            </div>
            <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full ${percent >= 100 ? 'bg-danger' : percent >= 80 ? 'bg-warning' : 'bg-primary'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      }
    },
    {
      key: 'endDate',
      label: 'Validity',
      render: (_, row) => (
        <div className="text-caption text-text-secondary">
          <p>From: {row.startDate ? format(new Date(row.startDate), 'MMM d, yyyy') : 'Immediate'}</p>
          <p>To: {row.endDate ? format(new Date(row.endDate), 'MMM d, yyyy') : 'No Expiry'}</p>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => getStatusBadge(getCouponStatus(row))
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => handleToggleStatus(row, e)}
            className={`p-1.5 rounded-lg transition-colors ${row.isActive ? 'text-success hover:bg-success/10' : 'text-text-muted hover:bg-surface-2'}`}
            title={row.isActive ? 'Deactivate Coupon' : 'Activate Coupon'}
          >
            {row.isActive ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={(e) => handleOpenEditModal(row, e)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Edit Coupon"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={(e) => handleDeleteCoupon(row.id, row.code, e)}
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Delete Coupon"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons & Promo Codes"
        description="Generate, manage, and monitor promotional discount coupons for retail sales."
        primaryAction={{
          label: 'Create Coupon',
          icon: PlusIcon,
          onClick: handleOpenCreateModal
        }}
        secondaryActions={
          <Button
            variant="outline"
            size="md"
            leftIcon={ArrowPathIcon}
            onClick={fetchCoupons}
          >
            Refresh
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <TicketIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Total Coupons</p>
            <p className="text-h2 font-bold text-text-primary">{stats.total}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-success/10 text-success">
            <CheckCircleIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Active & Valid</p>
            <p className="text-h2 font-bold text-text-primary">{stats.active}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-warning/10 text-warning">
            <TagIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Redemptions Used</p>
            <p className="text-h2 font-bold text-text-primary">{stats.totalRedeemed}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-danger/10 text-danger">
            <ClockIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Expired / Inactive</p>
            <p className="text-h2 font-bold text-text-primary">{stats.expired}</p>
          </div>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card variant="default" className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Search by promo code, title, or description..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              leftIcon={MagnifyingGlassIcon}
            />
          </div>

          <div className="sm:w-48">
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="exhausted">Fully Redeemed</option>
              <option value="disabled">Inactive</option>
            </select>
          </div>

          <div className="sm:w-48">
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Discount Types</option>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Coupons Table */}
      <Table
        columns={columns}
        data={filteredCoupons.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
        loading={loading}
        emptyTitle="No Coupons Found"
        emptyDescription="Create a promotional coupon code to offer customer discounts at checkout."
        onSelectRow={(id) => {
          const coupon = coupons.find(c => c.id === id);
          if (coupon) handleOpenEditModal(coupon);
        }}
        pagination={{
          currentPage,
          totalPages: Math.ceil(filteredCoupons.length / itemsPerPage) || 1,
          totalItems: filteredCoupons.length,
          pageSize: itemsPerPage,
          onPageChange: (p) => setCurrentPage(p)
        }}
      />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create New Coupon'}
        description="Set up promotional codes, discount values, spend thresholds, and usage limits."
      >
        <form onSubmit={handleSaveCoupon} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-small font-semibold text-text-primary mb-1">Coupon Code</label>
              <div className="flex gap-2">
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. SUMMER20"
                  required
                  className="uppercase font-mono tracking-wider font-bold"
                />
                <Button variant="outline" type="button" onClick={handleGenerateCode} title="Auto Generate">
                  <SparklesIcon className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Discount Type</label>
              <select
                value={formData.discountType}
                onChange={(e) => setFormData(prev => ({ ...prev, discountType: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1">Campaign Title</label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Easter Special Discount"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">
                {formData.discountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount'}
              </label>
              <Input
                type="number"
                min="1"
                max={formData.discountType === 'percentage' ? 100 : undefined}
                value={formData.discountValue}
                onChange={(e) => setFormData(prev => ({ ...prev, discountValue: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Min Order Spend</label>
              <Input
                type="number"
                min="0"
                value={formData.minSpend}
                onChange={(e) => setFormData(prev => ({ ...prev, minSpend: e.target.value }))}
                placeholder="0 = No minimum"
              />
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Max Cap Amount</label>
              <Input
                type="number"
                min="0"
                value={formData.maxDiscount}
                onChange={(e) => setFormData(prev => ({ ...prev, maxDiscount: e.target.value }))}
                placeholder="Optional"
                disabled={formData.discountType === 'fixed'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Total Max Redemptions</label>
              <Input
                type="number"
                min="1"
                value={formData.usageLimit}
                onChange={(e) => setFormData(prev => ({ ...prev, usageLimit: e.target.value }))}
                placeholder="e.g. 100"
              />
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Limit Per Customer</label>
              <Input
                type="number"
                min="1"
                value={formData.perUserLimit}
                onChange={(e) => setFormData(prev => ({ ...prev, perUserLimit: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Start Date</label>
              <Input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Expiration Date</label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1">Description / Internal Notes</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g. Valid for all customer tiers during holiday weekend."
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-border-default text-primary focus:ring-primary/30"
            />
            <label htmlFor="isActive" className="text-small font-semibold text-text-primary">
              Enable Coupon Code immediately
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t border-border-default">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              {editingCoupon ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
