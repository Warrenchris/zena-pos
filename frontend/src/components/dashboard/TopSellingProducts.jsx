import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchTopProducts } from '../../store/slices/analyticsSlice';
import useCurrency from '../../hooks/useCurrency';
import Card from '../ui/Card';
import {
  TrophyIcon,
  StarIcon,
  FireIcon,
} from '@heroicons/react/24/solid';

// Rank badge config for top 3
const RANK_STYLES = [
  { bg: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-600 dark:text-amber-400', Icon: TrophyIcon },
  { bg: 'bg-slate-100 dark:bg-slate-800/60',  text: 'text-slate-500 dark:text-slate-300',  Icon: StarIcon },
  { bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-600 dark:text-orange-400', Icon: FireIcon },
  { bg: 'bg-surface-2', text: 'text-text-muted', Icon: null },
  { bg: 'bg-surface-2', text: 'text-text-muted', Icon: null },
];

// Sort icon component
const SortChevron = ({ field, sortField, sortDirection }) => {
  if (field !== sortField) {
    return (
      <svg className="h-3.5 w-3.5 text-text-muted/40 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
      </svg>
    );
  }
  return sortDirection === 'asc' ? (
    <svg className="h-3.5 w-3.5 text-primary ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M8 15l4-4 4 4" />
    </svg>
  ) : (
    <svg className="h-3.5 w-3.5 text-primary ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M8 9l4 4 4-4" />
    </svg>
  );
};

const TopSellingProducts = ({ filter = { period: 'week' } }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { format } = useCurrency();

  const { products, salesPercentageChange, totalSales, loading, error } =
    useSelector((state) => state.analytics.topProducts);

  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    dispatch(fetchTopProducts({ limit: 5, ...filter }));
  }, [dispatch, filter]);

  const sortedProducts = [...(products || [])].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    return (a[sortField] - b[sortField]) * multiplier;
  });

  // Revenue share bar — relative to max product revenue
  const maxRevenue = Math.max(...(products || []).map((p) => p.revenue || 0), 1);

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortableHeader = ({ field, label, align = 'left' }) => (
    <th
      className={`px-4 py-3 text-${align} text-[10px] font-semibold uppercase tracking-wider text-text-muted cursor-pointer select-none hover:text-text-primary transition-colors`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortChevron field={field} sortField={sortField} sortDirection={sortDirection} />
      </span>
    </th>
  );

  // --- Loading skeleton ---
  if (loading) {
    return (
      <Card variant="default" className="p-6">
        <div className="animate-pulse space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-44 bg-surface-2 rounded-md" />
              <div className="h-3.5 w-28 bg-surface-2/70 rounded-md" />
            </div>
            <div className="h-8 w-24 bg-surface-2 rounded-lg" />
          </div>
          <div className="space-y-0">
            <div className="h-9 bg-surface-2/50 rounded-md mb-1" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-border-default/40 last:border-0">
                <div className="h-7 w-7 bg-surface-2 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-36 bg-surface-2 rounded" />
                  <div className="h-2 w-full bg-surface-2/60 rounded-full" />
                </div>
                <div className="h-4 w-14 bg-surface-2 rounded" />
                <div className="h-4 w-10 bg-surface-2 rounded" />
                <div className="h-4 w-20 bg-surface-2 rounded" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  // --- Error ---
  if (error) {
    return (
      <Card variant="default" className="p-6 border-danger/20 bg-danger/5">
        <div className="flex h-[320px] flex-col items-center justify-center text-center">
          <p className="text-danger font-semibold text-body mb-1">Unable to load top products</p>
          <p className="text-text-muted text-caption">{error}</p>
        </div>
      </Card>
    );
  }

  // --- Empty ---
  if (!products || products.length === 0) {
    return (
      <Card variant="default" className="p-6">
        <div className="mb-4">
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">Top Selling Products</h2>
          <p className="text-caption text-text-muted mt-0.5">No sales data available for this period</p>
        </div>
        <div className="flex h-[260px] items-center justify-center text-center text-text-muted">
          <div>
            <p className="text-body font-medium text-text-secondary">No products sold yet</p>
            <p className="mt-1 text-caption">Create some sales from the POS to see top performers here.</p>
          </div>
        </div>
      </Card>
    );
  }

  // --- Main render ---
  return (
    <Card variant="default" className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">Top Selling Products</h2>
          <p className="text-caption text-text-secondary mt-0.5">
            Best performers by revenue this period
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Total items sold badge */}
          <div className="px-3 py-1.5 rounded-xl bg-surface-2/60 border border-border-default/50 text-right">
            <span className="text-[10px] uppercase font-semibold text-text-muted block tracking-wider">
              Units Sold
            </span>
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-caption font-bold text-text-primary">
                {(totalSales || 0).toLocaleString()}
              </span>
              {salesPercentageChange !== undefined && (
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                    salesPercentageChange >= 0
                      ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/60'
                      : 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950/60'
                  }`}
                >
                  {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          {/* View all link */}
          <button
            onClick={() => navigate('/products')}
            className="text-caption font-semibold text-primary hover:text-primary-hover transition-colors px-2 py-1"
          >
            View All →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-6 px-6">
      <table className="min-w-full" style={{ minWidth: '480px' }}>
        <thead>
          <tr className="bg-surface-2/40 rounded-xl">
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted w-8">
              #
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Product
            </th>
            <SortableHeader field="price" label="Price" />
            <SortableHeader field="quantity" label="Qty Sold" align="right" />
            <SortableHeader field="revenue" label="Revenue" align="right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default/40">
          {sortedProducts.map((product, idx) => {
            // Find original rank (by revenue, descending) for rank badge
            const originalRank = [...(products || [])]
              .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
              .findIndex((p) => p.id === product.id);
            const rankStyle = RANK_STYLES[Math.min(originalRank, RANK_STYLES.length - 1)];
            const revenueShare = maxRevenue > 0 ? ((product.revenue || 0) / maxRevenue) * 100 : 0;

            return (
              <tr
                key={product.id}
                className="group transition-colors hover:bg-surface-2/50 cursor-pointer"
                onClick={() => navigate('/products')}
                title="View all products"
              >
                {/* Rank */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${rankStyle.bg} ${rankStyle.text}`}
                >
                  {rankStyle.Icon
                    ? <rankStyle.Icon className="h-4 w-4" />
                    : <span className="text-[11px] font-bold">{idx + 1}</span>
                  }
                </div>
                </td>

                {/* Product name + revenue share bar */}
                <td className="px-4 py-3 min-w-[180px]">
                  <div className="flex items-center gap-3">
                    {product.imageUrl ? (
                      <img
                        className="h-9 w-9 rounded-lg object-cover border border-border-default shrink-0"
                        src={product.imageUrl}
                        alt={product.name}
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary text-[13px] font-bold">
                          {(product.name || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-body font-medium text-text-primary truncate max-w-[160px]">
                        {product.name}
                      </p>
                      {/* Revenue share bar */}
                      <div className="mt-1 h-1.5 w-full max-w-[120px] bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 rounded-full bg-primary/70 transition-all duration-500"
                          style={{ width: `${revenueShare}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </td>

                {/* Unit price */}
                <td className="px-4 py-3 whitespace-nowrap text-body text-text-secondary">
                  {format(product.price)}
                </td>

                {/* Qty sold */}
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-body font-semibold text-text-primary">
                    {(product.quantity || 0).toLocaleString()}
                  </span>
                </td>

                {/* Revenue */}
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className="text-body font-bold text-text-primary">
                    {format(product.revenue || 0)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </Card>
  );
};

export default TopSellingProducts;