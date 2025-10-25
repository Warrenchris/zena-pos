import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Menu } from '@headlessui/react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, FunnelIcon, EyeIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { cashierAPI } from '../services/cashierAPI';
import useCurrency from '../hooks/useCurrency';

const SaleDetails = ({ sale, onClose }) => {
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <span className="font-bold">Invoice #{sale.invoiceNumber}</span>
        <span className={`px-2 py-1 rounded-full text-sm font-medium ${
          sale.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {sale.status}
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Product</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Quantity</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Price</th>
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(sale.products || []).map((product) => (
              <tr key={product.id}>
                <td className="px-4 py-2 whitespace-nowrap">{product.name}</td>
                <td className="px-4 py-2 text-right">{product.quantity}</td>
                <td className="px-4 py-2 text-right">${product.priceAtSale}</td>
                <td className="px-4 py-2 text-right">${product.quantity * product.priceAtSale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="border-t border-gray-200 pt-4">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>${sale.subtotal}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount:</span>
            <span className="text-green-500">-${sale.discount}</span>
          </div>
        )}
        <div className="flex justify-between font-bold mt-2">
          <span>Total:</span>
          <span>${sale.totalAmount}</span>
        </div>
      </div>
    </div>
  );
};

const SalesStats = ({ startDate, endDate, sales }) => {
  const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
  const avgTicket = totalSales / (sales.length || 1);
  const prevPeriodSales = sales
    .filter(sale => new Date(sale.createdAt) < startDate)
    .reduce((sum, sale) => sum + sale.totalAmount, 0);
  
  const salesGrowth = prevPeriodSales ? ((totalSales - prevPeriodSales) / prevPeriodSales) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mb-8">
      <div className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-lg">
        <div className="text-sm text-gray-500 dark:text-gray-400">Total Sales</div>
        <div className="text-2xl font-semibold mt-1">{formatCurrency(totalSales)}</div>
        <div className="text-sm mt-2 flex items-center">
          <span className={`mr-1 ${salesGrowth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {salesGrowth >= 0 ? '↑' : '↓'}
          </span>
          {Math.abs(salesGrowth).toFixed(1)}%
        </div>
      </div>

      <div className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-lg">
        <div className="text-sm text-gray-500 dark:text-gray-400">Average Ticket</div>
        <div className="text-2xl font-semibold mt-1">{formatCurrency(avgTicket)}</div>
        <div className="text-sm text-gray-500 mt-2">Per transaction</div>
      </div>

      <div className="p-4 bg-white dark:bg-gray-800 shadow-sm rounded-lg">
        <div className="text-sm text-gray-500 dark:text-gray-400">Total Transactions</div>
        <div className="text-2xl font-semibold mt-1">{sales.length}</div>
        <div className="text-sm text-gray-500 mt-2">For selected period</div>
      </div>
    </div>
  );
};

const MySales = () => {
  const { format: formatCurrency } = useCurrency();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dateRange, setDateRange] = useState([
    startOfDay(subDays(new Date(), 7)),
    endOfDay(new Date())
  ]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedSale, setSelectedSale] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const onDrawerOpen = () => setIsDrawerOpen(true);
  const onDrawerClose = () => setIsDrawerOpen(false);
  
  const fetchSales = async (page) => {
    try {
      const response = await cashierAPI.getMySales(page);
      const data = response.data || response; // support either axios response or direct data
      const rows = Array.isArray(data.sales) ? data.sales : [];

      // Normalize backend sales shape to UI-friendly shape
      const normalized = rows.map((s) => {
        const customer = s.Customer || s.customer || null;
        const saleItems = s.SaleItems || s.items || [];
        const products = saleItems.map((it) => ({
          id: it.ProductId || it.productId || it.id,
          name: it.Product?.name || it.name || 'Item',
          quantity: it.quantity || 1,
          priceAtSale: parseFloat(it.price ?? it.unitPrice ?? it.originalPrice ?? 0)
        }));
        return {
          id: s.id,
          createdAt: s.createdAt,
          invoiceNumber: s.invoiceNumber || s.id,
          customer,
          products,
          totalAmount: parseFloat(s.total ?? s.totalAmount ?? 0),
          subtotal: parseFloat(s.subtotal ?? 0),
          discount: parseFloat(s.discount ?? 0),
          paymentMethod: s.paymentMethod?.toUpperCase?.() || 'CASH',
          status: s.saleStatus?.toUpperCase?.() || 'COMPLETED'
        };
      });

      const pages = Math.max(1, Number(data.totalPages) || 1);
      const current = Math.min(Math.max(1, Number(data.currentPage) || Number(page) || 1), pages);

      setSales(normalized);
      setTotalPages(pages);
      setCurrentPage(current);
    } catch (error) {
      console.error('Error fetching sales:', error);
      // Graceful fallback on error
      setSales([]);
      setTotalPages(1);
      setCurrentPage(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales(currentPage);
  }, [currentPage]);

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold">My Sales History</h1>
        <div className="inline-flex rounded-md shadow-sm">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="inline-flex items-center px-2 py-1 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="inline-flex items-center px-2 py-1 rounded-r-md border border-l-0 border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          {!loading && sales.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-300">
              <div className="text-lg font-medium mb-1">No sales yet</div>
              <div className="text-sm">Your completed sales will appear here.</div>
            </div>
          ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Invoice #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Items</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Payment Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-6 py-4 whitespace-nowrap">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(sale.createdAt), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sale.customer?.name || 'Walk-in Customer'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {(Array.isArray(sale.products) ? sale.products.length : 0)} items
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                      {formatCurrency(Number(sale.totalAmount) || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        (sale.paymentMethod || '').toUpperCase() === 'CASH'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {(sale.paymentMethod || 'CASH')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        (sale.status || '').toUpperCase() === 'COMPLETED'
                          ? 'bg-green-100 text-green-800'
                          : (sale.status || '').toUpperCase() === 'PENDING'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {(sale.status || 'COMPLETED')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default MySales;