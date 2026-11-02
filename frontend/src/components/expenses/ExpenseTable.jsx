import React from 'react';
import {
  PencilIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BanknotesIcon,
  ExclamationCircleIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';

const categoryBadgeVariants = {
  inventory: 'primary',
  salary: 'info',
  rent: 'warning',
  utilities: 'neutral',
  maintenance: 'neutral',
  marketing: 'success',
  other: 'neutral',
};

function SkeletonRow({ canManage }) {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3.5"><div className="h-4 bg-surface-2 rounded-md w-3/4" /></td>
      <td className="px-4 py-3.5"><div className="h-5 bg-surface-2 rounded-full w-20" /></td>
      <td className="px-4 py-3.5"><div className="h-4 bg-surface-2 rounded-md w-24" /></td>
      <td className="px-4 py-3.5"><div className="h-4 bg-surface-2 rounded-md w-20" /></td>
      <td className="px-4 py-3.5"><div className="h-4 bg-surface-2 rounded-md w-24" /></td>
      <td className="px-4 py-3.5"><div className="h-4 bg-surface-2 rounded-md w-24" /></td>
      {canManage && (
        <td className="px-4 py-3.5 text-right"><div className="h-7 bg-surface-2 rounded-lg w-16 ml-auto" /></td>
      )}
    </tr>
  );
}

export default function ExpenseTable({
  loading,
  error,
  expenses = [],
  page = 1,
  limit = 10,
  total = 0,
  sortField,
  sortDirection,
  onSortChange,
  onPageChange,
  onLimitChange,
  onEdit,
  onDelete,
  canManage = false,
  formatCurrency,
  onCreate,
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 10)));

  const sorted = (expenses || []).slice().sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1;
    const get = (obj) => {
      switch (sortField) {
        case 'description': return (obj.description || '').toLowerCase();
        case 'category': return (obj.category || '').toLowerCase();
        case 'amount': return Number(obj.amount || 0);
        case 'date': return obj.date ? new Date(obj.date).getTime() : 0;
        case 'paymentMethod': return (obj.paymentMethod || '').toLowerCase();
        case 'addedBy': return (obj.recordedBy?.name || obj.user?.name || '').toLowerCase();
        default: return obj.id || 0;
      }
    };
    const va = get(a);
    const vb = get(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  const SortHeader = ({ field, children, alignRight }) => {
    const isActiveSort = sortField === field;
    const ariaSortValue = isActiveSort
      ? (sortDirection === 'asc' ? 'ascending' : 'descending')
      : undefined;

    return (
      <th
        scope="col"
        aria-sort={ariaSortValue}
        className={`px-4 py-3 text-caption font-semibold uppercase tracking-wider select-none ${
          alignRight ? 'text-right' : 'text-left'
        }`}
      >
        <button
          type="button"
          onClick={() => onSortChange?.(field)}
          className={`inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md py-0.5 ${
            isActiveSort
              ? 'text-primary font-bold'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <span>{children}</span>
          {isActiveSort ? (
            sortDirection === 'asc' ? (
              <ChevronUpIcon className="h-3.5 w-3.5 text-primary stroke-[2.5]" aria-hidden="true" />
            ) : (
              <ChevronDownIcon className="h-3.5 w-3.5 text-primary stroke-[2.5]" aria-hidden="true" />
            )
          ) : (
            <span className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40 transition-opacity">↕</span>
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border-default bg-surface shadow-floating">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="responsive-table w-full text-left text-body border-collapse">
          <thead className="bg-surface-2/70 text-text-secondary border-b border-border-default sticky top-0 z-10">
            <tr>
              <SortHeader field="description">Description</SortHeader>
              <SortHeader field="category">Category</SortHeader>
              <SortHeader field="amount">Amount</SortHeader>
              <SortHeader field="date">Date</SortHeader>
              <SortHeader field="paymentMethod">Payment Method</SortHeader>
              <SortHeader field="addedBy">Added By</SortHeader>
              {canManage && (
                <th scope="col" className="px-4 py-3 text-caption font-semibold uppercase tracking-wider text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-border-default text-text-primary">
            {loading ? (
              Array.from({ length: Math.min(limit, 5) }).map((_, i) => (
                <SkeletonRow key={i} canManage={canManage} />
              ))
            ) : error ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="p-8 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="p-2.5 rounded-full bg-danger/10 text-danger">
                      <ExclamationCircleIcon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <p className="font-semibold text-text-primary">Failed to load expenses</p>
                    <p className="text-caption text-text-secondary">{error}</p>
                  </div>
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="p-0">
                  <EmptyState
                    icon={BanknotesIcon}
                    title="No expenses found"
                    description="No expenses match your current filters. Add a new record or adjust your filter dates and category."
                    primaryAction={
                      canManage && onCreate ? (
                        <Button
                          variant="primary"
                          size="sm"
                          leftIcon={PlusIcon}
                          onClick={onCreate}
                        >
                          Add Expense
                        </Button>
                      ) : null
                    }
                  />
                </td>
              </tr>
            ) : (
              sorted.map((e) => (
                <tr
                  key={e.id}
                  className="hover:bg-surface-2/60 transition-colors duration-150 group"
                >
                  <td className="px-4 py-3.5 font-medium text-text-primary" data-label="Description">
                    {e.description}
                  </td>
                  <td className="px-4 py-3.5 capitalize" data-label="Category">
                    <Badge variant={categoryBadgeVariants[e.category] || 'neutral'}>
                      {e.category ? e.category.replace('_', ' ') : 'other'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-text-primary font-mono tracking-tight" data-label="Amount">
                    {formatCurrency ? formatCurrency(e.amount) : e.amount}
                  </td>
                  <td className="px-4 py-3.5 text-text-secondary text-caption whitespace-nowrap" data-label="Date">
                    {e.date ? new Date(e.date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-text-secondary text-caption capitalize" data-label="Payment">
                    {e.paymentMethod ? e.paymentMethod.replace('_', ' ') : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-text-secondary text-caption" data-label="Added By">
                    {e.recordedBy?.name || e.user?.name || '—'}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3.5 text-right" data-label="Actions">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEdit?.(e)}
                          className="touch-target p-1.5 rounded-xl border border-border-default bg-surface text-text-secondary hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          aria-label={`Edit expense ${e.description}`}
                          title="Edit expense"
                        >
                          <PencilIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete?.(e)}
                          className="touch-target p-1.5 rounded-xl border border-border-default bg-surface text-text-secondary hover:text-danger hover:border-danger/40 hover:bg-danger/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                          aria-label={`Delete expense ${e.description}`}
                          title="Delete expense"
                        >
                          <TrashIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border-default bg-surface text-caption text-text-secondary">
        <div>
          Showing page <span className="font-semibold text-text-primary">{page}</span> of{' '}
          <span className="font-semibold text-text-primary">{totalPages}</span> •{' '}
          <span className="font-semibold text-text-primary">{total}</span> total records
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-caption text-text-muted">Per page:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange?.(parseInt(e.target.value, 10))}
              className="bg-surface text-text-primary border border-border-default rounded-xl px-2.5 py-1 text-caption focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer"
              aria-label="Items per page"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n} className="bg-surface text-text-primary">
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange?.(Math.max(1, page - 1))}
              leftIcon={ChevronLeftIcon}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
              rightIcon={ChevronRightIcon}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
