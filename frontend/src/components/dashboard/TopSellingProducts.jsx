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
      <HiSortAscending className="h-5 w-5 text-yellow-200" />
    ) : (
      <HiSortDescending className="h-5 w-5 text-yellow-200" />
    );
  };

  if (loading) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex h-[400px] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-yellow-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[20px] border border-red-400/30 bg-black/50 p-6 shadow-[0_0_20px_rgba(248,113,113,0.25)]">
        <div className="flex h-[400px] flex-col items-center justify-center text-center">
          <p className="mb-2 text-red-300">Error loading top products</p>
          <p className="text-sm text-white/60">{error}</p>
        </div>
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="rounded-[20px] border border-yellow-400/25 bg-black/40 p-6 shadow-[0_0_28px_rgba(250,204,21,0.12)]">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold text-yellow-200">Top Selling Products</h2>
            <div className="text-sm text-white/60">No sales data available</div>
          </div>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-sm font-medium text-yellow-100 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
          >
            <option value="week" className="bg-[#0b0f1b] text-white">This Week</option>
            <option value="month" className="bg-[#0b0f1b] text-white">This Month</option>
            <option value="year" className="bg-[#0b0f1b] text-white">This Year</option>
          </select>
        </div>
        <div className="flex h-[300px] items-center justify-center text-center text-white/60">
          <div>
            <p className="text-lg font-semibold text-yellow-100/80">No products sold in this period</p>
            <p className="mt-2 text-sm text-white/60">Create some sales to see top products here.</p>
          </div>
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
            Total Sales: {totalSales?.toLocaleString()}
            <span className={`ml-2 ${salesPercentageChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="rounded-full border border-yellow-400/30 bg-black/40 px-4 py-2 text-sm font-medium text-yellow-100 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
        >
          <option value="week" className="bg-[#0b0f1b] text-white">This Week</option>
          <option value="month" className="bg-[#0b0f1b] text-white">This Month</option>
          <option value="year" className="bg-[#0b0f1b] text-white">This Year</option>
        </select>
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
          {sortedProducts.map((product) => (
            <tr key={product.id} className="transition hover:bg-yellow-500/5">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  {product.imageUrl && (
                    <img
                      className="mr-3 h-10 w-10 rounded-md object-cover"
                      src={product.imageUrl}
                      alt={product.name}
                    />
                  )}
                  <div className="text-sm font-semibold text-white">
                    {product.name}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-100/80">
                {format(product.price)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-100/80">
                {product.quantity.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-yellow-100">
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