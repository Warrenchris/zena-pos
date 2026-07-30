import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiSortAscending, HiSortDescending } from 'react-icons/hi';
import { fetchTopProducts } from '../../store/slices/analyticsSlice';
import useCurrency from '../../hooks/useCurrency';

const TopSellingProducts = () => {
  const dispatch = useDispatch();
  const { format } = useCurrency();
  const { products, salesPercentageChange, totalSales, loading, error } =
    useSelector((state) => state.analytics.topProducts);
  const [sortField, setSortField] = useState('quantity');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    dispatch(fetchTopProducts({ period: selectedPeriod, limit: 5 }));
  }, [dispatch, selectedPeriod]);

  const sortedProducts = [...(products || [])].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    return (a[sortField] - b[sortField]) * multiplier;
  });

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
      <HiSortAscending className="h-4 w-4 text-primary" />
    ) : (
      <HiSortDescending className="h-4 w-4 text-primary" />
    );
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-6 shadow-floating">
        <div className="flex h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-danger/20 bg-danger/5 p-6 shadow-floating">
        <div className="flex h-[400px] flex-col items-center justify-center text-center">
          <p className="mb-2 text-danger font-medium text-body">Error loading top products</p>
          <p className="text-caption text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="rounded-2xl border border-border-default bg-surface p-6 shadow-floating">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-h3 font-semibold text-text-primary tracking-tight">Top Selling Products</h2>
            <div className="text-caption text-text-muted">No sales data available</div>
          </div>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-lg border border-border-default bg-surface-0 px-3 py-1.5 text-caption font-medium text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors duration-150"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>
        <div className="flex h-[300px] items-center justify-center text-center text-text-muted">
          <div>
            <p className="text-body font-semibold text-text-secondary">No products sold in this period</p>
            <p className="mt-1 text-caption text-text-muted">Create some sales to see top products here.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-default bg-surface p-6 shadow-floating overflow-x-auto">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-h3 font-semibold text-text-primary tracking-tight">Top Selling Products</h2>
          <div className="text-caption text-text-secondary mt-0.5">
            Total Sales: {totalSales?.toLocaleString()}
            <span className={`ml-2 font-medium ${salesPercentageChange >= 0 ? 'text-success' : 'text-danger'}`}>
              {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-lg border border-border-default bg-surface-0 px-3 py-1.5 text-caption font-medium text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors duration-150"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <table className="min-w-full divide-y divide-border-default/70">
        <thead className="bg-surface-0">
          <tr>
            <th className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wider text-text-muted">
              Product
            </th>
            <th
              className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-primary"
              onClick={() => handleSort('price')}
            >
              <div className="flex items-center space-x-1">
                <span>Price</span>
                <SortIcon field="price" />
              </div>
            </th>
            <th
              className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-primary"
              onClick={() => handleSort('quantity')}
            >
              <div className="flex items-center space-x-1">
                <span>Quantity Sold</span>
                <SortIcon field="quantity" />
              </div>
            </th>
            <th
              className="px-4 py-3 text-left text-caption font-semibold uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-primary"
              onClick={() => handleSort('revenue')}
            >
              <div className="flex items-center space-x-1">
                <span>Revenue</span>
                <SortIcon field="revenue" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default/50">
          {sortedProducts.map((product) => (
            <tr key={product.id} className="transition hover:bg-surface-2/60">
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="flex items-center">
                  {product.imageUrl && (
                    <img
                      className="mr-3 h-8 w-8 rounded-md object-cover border border-border-default"
                      src={product.imageUrl}
                      alt={product.name}
                    />
                  )}
                  <div className="text-body font-medium text-text-primary">
                    {product.name}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-body text-text-secondary">
                {format(product.price)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-body text-text-secondary">
                {product.quantity.toLocaleString()}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-body font-semibold text-text-primary">
                {format(product.revenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TopSellingProducts;