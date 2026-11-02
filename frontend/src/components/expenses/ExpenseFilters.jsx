import React, { useState, useEffect } from 'react';
import { ArrowPathIcon, FunnelIcon } from '@heroicons/react/24/outline';
import Button from '../ui/Button';

const categories = [
  { value: '', label: 'All Categories' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'salary', label: 'Salaries' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
];

const paymentMethods = [
  { value: '', label: 'All Methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'M-Pesa / Mobile Money' },
  { value: 'other', label: 'Other' },
];

export default function ExpenseFilters({ value = {}, onChange, onReset }) {
  const [local, setLocal] = useState({
    startDate: value.startDate || '',
    endDate: value.endDate || '',
    category: value.category || '',
    paymentMethod: value.paymentMethod || '',
  });

  useEffect(() => {
    setLocal({
      startDate: value.startDate || '',
      endDate: value.endDate || '',
      category: value.category || '',
      paymentMethod: value.paymentMethod || '',
    });
  }, [value]);

  const update = (field, v) => {
    const next = { ...local, [field]: v };
    setLocal(next);
    onChange?.(next);
  };

  const hasActiveFilters = Boolean(
    local.startDate || local.endDate || local.category || local.paymentMethod
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div>
          <label htmlFor="filter-start-date" className="block text-caption font-semibold text-text-secondary mb-1.5">
            Start Date
          </label>
          <input
            id="filter-start-date"
            type="date"
            value={local.startDate}
            onChange={(e) => update('startDate', e.target.value)}
            className="w-full bg-surface text-text-primary border border-border-default rounded-xl px-3.5 py-2 text-small transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div>
          <label htmlFor="filter-end-date" className="block text-caption font-semibold text-text-secondary mb-1.5">
            End Date
          </label>
          <input
            id="filter-end-date"
            type="date"
            value={local.endDate}
            min={local.startDate || undefined}
            onChange={(e) => update('endDate', e.target.value)}
            className="w-full bg-surface text-text-primary border border-border-default rounded-xl px-3.5 py-2 text-small transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div>
          <label htmlFor="filter-category" className="block text-caption font-semibold text-text-secondary mb-1.5">
            Category
          </label>
          <select
            id="filter-category"
            value={local.category}
            onChange={(e) => update('category', e.target.value)}
            className="w-full bg-surface text-text-primary border border-border-default rounded-xl px-3.5 py-2 text-small transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value} className="bg-surface text-text-primary">
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filter-payment-method" className="block text-caption font-semibold text-text-secondary mb-1.5">
            Payment Method
          </label>
          <select
            id="filter-payment-method"
            value={local.paymentMethod}
            onChange={(e) => update('paymentMethod', e.target.value)}
            className="w-full bg-surface text-text-primary border border-border-default rounded-xl px-3.5 py-2 text-small transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
          >
            {paymentMethods.map((m) => (
              <option key={m.value} value={m.value} className="bg-surface text-text-primary">
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <span className="inline-flex items-center gap-1.5 text-caption font-medium text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
              <FunnelIcon className="h-3.5 w-3.5" aria-hidden="true" />
              Active Filters Applied
            </span>
          )}
        </div>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            leftIcon={ArrowPathIcon}
            className="text-text-muted hover:text-text-primary"
          >
            Reset Filters
          </Button>
        )}
      </div>
    </div>
  );
}
