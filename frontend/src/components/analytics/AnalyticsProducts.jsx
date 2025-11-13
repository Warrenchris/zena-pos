import React, { useMemo, useState } from 'react';
import { HiSortAscending, HiSortDescending } from 'react-icons/hi';
import useCurrency from '../../hooks/useCurrency';

const AnalyticsProducts = ({ topProducts, loading, selectedPeriod }) => {
  const { format: formatLocale } = useCurrency();
  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState('desc');

  const products = useMemo(() => {
    const list = (topProducts?.products || []).map((product) => ({
      ...product,
      price: Number(product.price || 0),
      quantity: Number(product.quantity || product.sellCount || 0),
      revenue: Number(product.revenue || product.earnings || 0),
    }));
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const valueA = typeof a[sortField] === 'string' ? a[sortField].toLowerCase() : a[sortField];
      const valueB = typeof b[sortField] === 'string' ? b[sortField].toLowerCase() : b[sortField];
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return valueA.localeCompare(valueB) * multiplier;
      }
      return (valueA - valueB) * multiplier;
    });
  }, [topProducts, sortField, sortDirection]);

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (field !== sortField) return null;
    return sortDirection === 'asc' ? (
      <HiSortAscending className="h-5 w-5 text-yellow-200" />
    ) : (
      <HiSortDescending className="h-5 w-5 text-yellow-200" />
    );
  };

  const totalSales = Number(topProducts?.totalSales || 0);
  const salesChange = Number(topProducts?.salesPercentageChange || 0);

  if (loading) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex h-[400px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-yellow-400" />
        </div>
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-yellow-200">Top Selling Products</h2>
            <div className="text-sm text-white/60">No sales data available</div>
          </div>
          <div className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.18em] text-yellow-100/70">
            {selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)} view
          </div>
        </div>
        <div className="flex h-[300px] items-center justify-center text-center text-white/60">
          Create some sales to see top products here.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)] animate-fadeUp overflow-x-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-yellow-200">Top Selling Products</h2>
          <div className="text-sm text-white/70">
            Total Units Sold: {totalSales.toLocaleString()}
            <span className={`ml-2 ${salesChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {salesChange >= 0 ? '↑' : '↓'} {Math.abs(salesChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.18em] text-yellow-100/70">
          {selectedPeriod.charAt(0).toUpperCase() + selectedPeriod.slice(1)} view
        </div>
      </div>

      <table className="min-w-full divide-y divide-yellow-400/15">
        <thead className="bg-black/30">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100/70">
              Product
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100/70 cursor-pointer"
              onClick={() => handleSort('price')}
            >
              <div className="flex items-center space-x-1">
                <span>Price</span>
                <SortIcon field="price" />
              </div>
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100/70 cursor-pointer"
              onClick={() => handleSort('quantity')}
            >
              <div className="flex items-center space-x-1">
                <span>Quantity Sold</span>
                <SortIcon field="quantity" />
              </div>
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100/70 cursor-pointer"
              onClick={() => handleSort('revenue')}
            >
              <div className="flex items-center space-x-1">
                <span>Revenue</span>
                <SortIcon field="revenue" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-yellow-400/10">
          {products.map((product) => (
            <tr key={product.id} className="transition hover:bg-yellow-500/5">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-semibold text-white">{product.name}</div>
                {product.sku && <div className="text-xs text-white/50">SKU: {product.sku}</div>}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-100/80">
                {formatLocale(product.price)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-100/80">
                {product.quantity.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-yellow-100">
                {formatLocale(product.revenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AnalyticsProducts;