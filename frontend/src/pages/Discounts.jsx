import React, { useState, useEffect, useMemo } from 'react';
import {
  PercentBadgeIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  TagIcon,
  TrashIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShoppingBagIcon,
  CalendarIcon,
  SparklesIcon,
  GiftIcon
} from '@heroicons/react/24/outline';
import { format, isAfter, isBefore } from 'date-fns';
import { useCurrency } from '../hooks/useCurrency';
import { useToast } from '../components/Toast';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';

// Initial sample discount rules
const DEFAULT_DISCOUNTS = [
  {
    id: '1',
    name: 'Weekend Storewide Clearance',
    ruleType: 'percentage', // 'percentage' | 'fixed' | 'bogo' | 'bulk'
    discountValue: 15,
    scope: 'storewide', // 'storewide' | 'category' | 'product'
    targetName: 'All Products',
    minQuantity: 1,
    minAmount: 0,
    startDate: '2026-07-01',
    endDate: '2026-12-31',
    isActive: true,
    description: '15% automatic discount on all store items every weekend.'
  },
  {
    id: '2',
    name: 'Beverage Category Sale',
    ruleType: 'percentage',
    discountValue: 10,
    scope: 'category',
    targetName: 'Beverages & Soft Drinks',
    minQuantity: 2,
    minAmount: 300,
    startDate: '2026-06-01',
    endDate: '2026-09-30',
    isActive: true,
    description: '10% off when buying 2+ items from the Beverage catalog.'
  },
  {
    id: '3',
    name: 'Bulk Purchase Tier Savings',
    ruleType: 'bulk',
    discountValue: 20,
    scope: 'storewide',
    targetName: 'All Items',
    minQuantity: 5,
    minAmount: 2000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    isActive: true,
    description: 'Buy 5 or more items totaling over KSh 2,000 to get 20% off.'
  },
  {
    id: '4',
    name: 'Buy 2 Get 1 Free Special (BOGO)',
    ruleType: 'bogo',
    discountValue: 100,
    scope: 'category',
    targetName: 'Snacks & Confectionery',
    minQuantity: 3,
    minAmount: 0,
    startDate: '2026-05-01',
    endDate: '2026-08-31',
    isActive: false,
    description: 'Buy 2 snacks, get the 3rd item free.'
  }
];

export default function Discounts() {
  const { format: formatCurrency } = useCurrency();
  const { showToast } = useToast();

  const [discounts, setDiscounts] = useState(() => {
    try {
      const saved = localStorage.getItem('zana_pos_discounts');
      return saved ? JSON.parse(saved) : DEFAULT_DISCOUNTS;
    } catch {
      return DEFAULT_DISCOUNTS;
    }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    ruleType: 'percentage',
    discountValue: 10,
    scope: 'storewide',
    targetName: 'All Products',
    minQuantity: 1,
    minAmount: 0,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    isActive: true,
    description: ''
  });

  // Save discounts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('zana_pos_discounts', JSON.stringify(discounts));
    } catch (e) {
      console.error('Failed to save discounts to local storage', e);
    }
  }, [discounts]);

  // Determine status of discount rule
  const getRuleStatus = (rule) => {
    if (!rule.isActive) return 'inactive';
    const now = new Date();
    if (rule.endDate && isAfter(now, new Date(rule.endDate + 'T23:59:59'))) return 'expired';
    if (rule.startDate && isBefore(now, new Date(rule.startDate + 'T00:00:00'))) return 'scheduled';
    return 'active';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active Offer</Badge>;
      case 'scheduled':
        return <Badge variant="warning">Scheduled</Badge>;
      case 'expired':
        return <Badge variant="danger">Expired</Badge>;
      case 'inactive':
      default:
        return <Badge variant="neutral">Disabled</Badge>;
    }
  };

  const getRuleTypeBadge = (type) => {
    switch (type) {
      case 'percentage':
        return <Badge variant="primary">% Percentage</Badge>;
      case 'fixed':
        return <Badge variant="success">Fixed Amount</Badge>;
      case 'bulk':
        return <Badge variant="warning">Bulk Tier</Badge>;
      case 'bogo':
        return <Badge variant="secondary">BOGO Free</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  // Open modal for create
  const handleOpenCreateModal = () => {
    setEditingDiscount(null);
    setFormData({
      name: '',
      ruleType: 'percentage',
      discountValue: 15,
      scope: 'storewide',
      targetName: 'All Products',
      minQuantity: 1,
      minAmount: 0,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      isActive: true,
      description: ''
    });
    setShowModal(true);
  };

  // Open modal for edit
  const handleOpenEditModal = (discount, e) => {
    if (e) e.stopPropagation();
    setEditingDiscount(discount);
    setFormData({
      name: discount.name,
      ruleType: discount.ruleType,
      discountValue: discount.discountValue,
      scope: discount.scope,
      targetName: discount.targetName,
      minQuantity: discount.minQuantity || 1,
      minAmount: discount.minAmount || 0,
      startDate: discount.startDate || '',
      endDate: discount.endDate || '',
      isActive: discount.isActive,
      description: discount.description || ''
    });
    setShowModal(true);
  };

  // Toggle active status
  const handleToggleStatus = (id, e) => {
    if (e) e.stopPropagation();
    setDiscounts(prev => prev.map(d => {
      if (d.id === id) {
        const updated = !d.isActive;
        showToast('info', `Discount rule "${d.name}" ${updated ? 'activated' : 'disabled'}.`);
        return { ...d, isActive: updated };
      }
      return d;
    }));
  };

  // Delete discount rule
  const handleDeleteDiscount = (id, name, e) => {
    if (e) e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete discount rule "${name}"?`)) {
      setDiscounts(prev => prev.filter(d => d.id !== id));
      showToast('success', `Discount rule "${name}" deleted.`);
    }
  };

  // Save form handler
  const handleSaveDiscount = (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast('error', 'Discount rule name is required.');
      return;
    }

    const payload = {
      id: editingDiscount ? editingDiscount.id : String(Date.now()),
      name: formData.name.trim(),
      ruleType: formData.ruleType,
      discountValue: Number(formData.discountValue) || 0,
      scope: formData.scope,
      targetName: formData.targetName.trim() || (formData.scope === 'storewide' ? 'All Products' : 'Selected Items'),
      minQuantity: Number(formData.minQuantity) || 1,
      minAmount: Number(formData.minAmount) || 0,
      startDate: formData.startDate,
      endDate: formData.endDate,
      isActive: formData.isActive,
      description: formData.description.trim()
    };

    if (editingDiscount) {
      setDiscounts(prev => prev.map(d => d.id === editingDiscount.id ? payload : d));
      showToast('success', `Discount rule "${payload.name}" updated successfully!`);
    } else {
      setDiscounts(prev => [payload, ...prev]);
      showToast('success', `New discount rule "${payload.name}" created!`);
    }

    setShowModal(false);
  };

  // Filtered list
  const filteredDiscounts = useMemo(() => {
    return discounts.filter(d => {
      const status = getRuleStatus(d);
      const matchesSearch =
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.targetName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.description || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = filterType === 'all' || d.ruleType === filterType;
      const matchesStatus = filterStatus === 'all' || status === filterStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [discounts, searchTerm, filterType, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    const total = discounts.length;
    const active = discounts.filter(d => getRuleStatus(d) === 'active').length;
    const storewide = discounts.filter(d => d.scope === 'storewide').length;
    const categoryRules = discounts.filter(d => d.scope === 'category').length;

    return { total, active, storewide, categoryRules };
  }, [discounts]);

  // Table Columns
  const columns = [
    {
      key: 'name',
      label: 'Rule Name & Offer',
      render: (val, row) => (
        <div>
          <p className="font-semibold text-text-primary">{val}</p>
          <p className="text-caption text-text-muted truncate max-w-xs">{row.description || 'No description'}</p>
        </div>
      )
    },
    {
      key: 'ruleType',
      label: 'Offer Type',
      render: (val) => getRuleTypeBadge(val)
    },
    {
      key: 'discountValue',
      label: 'Discount Value',
      render: (_, row) => {
        if (row.ruleType === 'bogo') {
          return <span className="font-bold text-secondary">Buy {row.minQuantity || 2} Get 1 Free</span>;
        }
        return (
          <span className="font-bold text-success text-body">
            {row.ruleType === 'percentage' || row.ruleType === 'bulk'
              ? `${row.discountValue}% OFF`
              : `${formatCurrency(row.discountValue)} OFF`}
          </span>
        );
      }
    },
    {
      key: 'scope',
      label: 'Applies To',
      render: (_, row) => (
        <div>
          <p className="font-medium text-text-primary capitalize">{row.scope}</p>
          <p className="text-caption text-text-muted">{row.targetName}</p>
        </div>
      )
    },
    {
      key: 'minAmount',
      label: 'Min Condition',
      render: (_, row) => (
        <div className="text-small text-text-secondary">
          {row.minQuantity > 1 && <p>Min Qty: <span className="font-semibold text-text-primary">{row.minQuantity}</span></p>}
          {row.minAmount > 0 && <p>Min Spend: <span className="font-semibold text-text-primary">{formatCurrency(row.minAmount)}</span></p>}
          {row.minQuantity <= 1 && row.minAmount <= 0 && <p className="text-text-muted italic">None</p>}
        </div>
      )
    },
    {
      key: 'endDate',
      label: 'Validity',
      render: (_, row) => (
        <div className="text-caption text-text-secondary">
          <p>Start: {row.startDate ? format(new Date(row.startDate), 'MMM d, yyyy') : 'Immediate'}</p>
          <p>End: {row.endDate ? format(new Date(row.endDate), 'MMM d, yyyy') : 'Continuous'}</p>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => getStatusBadge(getRuleStatus(row))
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => handleToggleStatus(row.id, e)}
            className={`p-1.5 rounded-lg transition-colors ${row.isActive ? 'text-success hover:bg-success/10' : 'text-text-muted hover:bg-surface-2'}`}
            title={row.isActive ? 'Disable Rule' : 'Enable Rule'}
          >
            {row.isActive ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={(e) => handleOpenEditModal(row, e)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Edit Rule"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={(e) => handleDeleteDiscount(row.id, row.name, e)}
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            title="Delete Rule"
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
        title="Discount Rules & Offers"
        description="Configure automated store discounts, promotional sales, category markdowns, and bulk pricing rules."
        primaryAction={{
          label: 'Create Discount Rule',
          icon: PlusIcon,
          onClick: handleOpenCreateModal
        }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <PercentBadgeIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Total Rules</p>
            <p className="text-h2 font-bold text-text-primary">{stats.total}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-success/10 text-success">
            <SparklesIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Active Offers</p>
            <p className="text-h2 font-bold text-text-primary">{stats.active}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-warning/10 text-warning">
            <ShoppingBagIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Storewide Sales</p>
            <p className="text-h2 font-bold text-text-primary">{stats.storewide}</p>
          </div>
        </Card>

        <Card variant="default" className="p-4 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-secondary/10 text-secondary">
            <TagIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-caption font-semibold text-text-muted uppercase">Category Deals</p>
            <p className="text-h2 font-bold text-text-primary">{stats.categoryRules}</p>
          </div>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card variant="default" className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Search by rule name, category/product, or description..."
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
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All Offer Types</option>
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount</option>
              <option value="bulk">Bulk Tier</option>
              <option value="bogo">BOGO Free</option>
            </select>
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
              <option value="inactive">Disabled</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Discount Rules Table */}
      <Table
        columns={columns}
        data={filteredDiscounts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
        emptyTitle="No Discount Rules Found"
        emptyDescription="Create a promotional discount rule to apply automated markdowns at checkout."
        onSelectRow={(id) => {
          const item = discounts.find(d => d.id === id);
          if (item) handleOpenEditModal(item);
        }}
        pagination={{
          currentPage,
          totalPages: Math.ceil(filteredDiscounts.length / itemsPerPage) || 1,
          totalItems: filteredDiscounts.length,
          pageSize: itemsPerPage,
          onPageChange: (p) => setCurrentPage(p)
        }}
      />

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingDiscount ? `Edit Rule: ${editingDiscount.name}` : 'Create New Discount Rule'}
        description="Define storewide or category promotional discounts and automatic checkout markdowns."
      >
        <form onSubmit={handleSaveDiscount} className="space-y-4">
          <div>
            <label className="block text-small font-semibold text-text-primary mb-1">Rule Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Weekend Beverage Sale"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Offer Type</label>
              <select
                value={formData.ruleType}
                onChange={(e) => setFormData(prev => ({ ...prev, ruleType: e.target.value }))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
              >
                <option value="percentage">Percentage Off (%)</option>
                <option value="fixed">Fixed Amount Off</option>
                <option value="bulk">Bulk Quantity Tier</option>
                <option value="bogo">Buy X Get 1 Free (BOGO)</option>
              </select>
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">
                {formData.ruleType === 'percentage' || formData.ruleType === 'bulk'
                  ? 'Discount Percentage (%)'
                  : 'Discount Amount / Value'}
              </label>
              <Input
                type="number"
                min="0"
                max={formData.ruleType === 'percentage' ? 100 : undefined}
                value={formData.discountValue}
                onChange={(e) => setFormData(prev => ({ ...prev, discountValue: e.target.value }))}
                disabled={formData.ruleType === 'bogo'}
                required={formData.ruleType !== 'bogo'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Applicable Scope</label>
              <select
                value={formData.scope}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    scope: val,
                    targetName: val === 'storewide' ? 'All Products' : ''
                  }));
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
              >
                <option value="storewide">Storewide (All Products)</option>
                <option value="category">Specific Category</option>
                <option value="product">Selected Items</option>
              </select>
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Target Name / Category</label>
              <Input
                value={formData.targetName}
                onChange={(e) => setFormData(prev => ({ ...prev, targetName: e.target.value }))}
                placeholder="e.g. Beverages, Electronics, All Items"
                disabled={formData.scope === 'storewide'}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Min Quantity Trigger</label>
              <Input
                type="number"
                min="1"
                value={formData.minQuantity}
                onChange={(e) => setFormData(prev => ({ ...prev, minQuantity: e.target.value }))}
                placeholder="1"
              />
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1">Min Spend Trigger</label>
              <Input
                type="number"
                min="0"
                value={formData.minAmount}
                onChange={(e) => setFormData(prev => ({ ...prev, minAmount: e.target.value }))}
                placeholder="0 = No minimum spend"
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
              <label className="block text-small font-semibold text-text-primary mb-1">End Date</label>
              <Input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1">Description / Notes</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="e.g. Applied automatically to all beverage items during morning hours."
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="isActiveDiscount"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-border-default text-primary focus:ring-primary/30"
            />
            <label htmlFor="isActiveDiscount" className="text-small font-semibold text-text-primary">
              Enable Discount Rule immediately
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-3 border-t border-border-default">
            <Button variant="outline" type="button" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingDiscount ? 'Save Rule Changes' : 'Create Discount Rule'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
