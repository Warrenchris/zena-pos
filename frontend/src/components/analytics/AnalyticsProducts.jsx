import React, { useState } from 'react';
import { HiSortAscending, HiSortDescending } from 'react-icons/hi';
import useCurrency from '../../hooks/useCurrency';

const AnalyticsProducts = () => {
  const { format: formatLocale } = useCurrency();
  const [sortField, setSortField] = useState('earnings');
  const [sortDirection, setSortDirection] = useState('desc');

  const products = [
    {
      id: 1,
      name: 'Wireless Earbuds Pro',
      price: 129.99,
      formattedPrice: formatLocale(129.99),
      status: 'active',
      sellCount: 1234,
      viewCount: 5678,
      earnings: 160366.66,
      formattedEarnings: formatLocale(160366.66),
    },
    {
      id: 2,
      name: 'Smart Watch Series X',
      price: 299.99,
      status: 'active',
      sellCount: 987,
      viewCount: 4321,
      earnings: 296090.13,
    },
    {
      id: 3,
      name: 'Premium Laptop Stand',
      price: 49.99,
      status: 'inactive',
      sellCount: 756,
      viewCount: 3456,
      earnings: 37792.44,
    },
    {
      id: 4,
      name: 'Ultra HD Monitor',
      price: 399.99,
      status: 'active',
      sellCount: 543,
      viewCount: 2345,
      earnings: 217194.57,
    },
    {
      id: 5,
      name: 'Mechanical Keyboard',
      price: 159.99,
      status: 'active',
      sellCount: 432,
      viewCount: 1987,
      earnings: 69115.68,
    },
  ].sort((a, b) => {
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

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm overflow-x-auto">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Top Selling Products
      </h2>

      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              No
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
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
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('sellCount')}
            >
              <div className="flex items-center space-x-1">
                <span>Sell Count</span>
                <SortIcon field="sellCount" />
              </div>
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('viewCount')}
            >
              <div className="flex items-center space-x-1">
                <span>View Count</span>
                <SortIcon field="viewCount" />
              </div>
            </th>
            <th 
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
              onClick={() => handleSort('earnings')}
            >
              <div className="flex items-center space-x-1">
                <span>Earnings</span>
                <SortIcon field="earnings" />
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {products.map((product) => (
            <tr key={product.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {product.id}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {product.name}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${product.price.toFixed(2)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    product.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {product.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {product.sellCount.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {product.viewCount.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                ${product.earnings.toLocaleString(undefined, {
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

export default AnalyticsProducts;