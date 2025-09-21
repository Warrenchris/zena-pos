import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { HiSortAscending, HiSortDescending } from 'react-icons/hi';
import { fetchTopProducts } from '../../store/slices/analyticsSlice';

const TopSellingProducts = () => {
  const dispatch = useDispatch();
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
      <HiSortAscending className="w-5 h-5" />
    ) : (
      <HiSortDescending className="w-5 h-5" />
    );
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-center items-center h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-center items-center h-[400px] text-red-500">
          Error loading top products: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm overflow-x-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Top Selling Products</h2>
          <div className="text-sm text-gray-500">
            Total Sales: {totalSales?.toLocaleString()}
            <span className={`ml-2 ${salesPercentageChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {salesPercentageChange >= 0 ? '↑' : '↓'} {Math.abs(salesPercentageChange).toFixed(1)}%
            </span>
          </div>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="border-gray-300 rounded-lg shadow-sm focus:border-orange-500 focus:ring-orange-500"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Product
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('price')}
            >
              <div className="flex items-center space-x-1">
                <span>Price</span>
                <SortIcon field="price" />
              </div>
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('quantity')}
            >
              <div className="flex items-center space-x-1">
                <span>Quantity Sold</span>
                <SortIcon field="quantity" />
              </div>
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('revenue')}
            >
              <div className="flex items-center space-x-1">
                <span>Revenue</span>
                <SortIcon field="revenue" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedProducts.map((product, index) => (
            <tr key={product.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  {product.imageUrl && (
                    <img
                      className="h-10 w-10 rounded-md mr-3 object-cover"
                      src={product.imageUrl}
                      alt={product.name}
                    />
                  )}
                  <div className="text-sm font-medium text-gray-900">
                    {product.name}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${product.price.toFixed(2)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {product.quantity.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                ${product.revenue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TopSellingProducts;