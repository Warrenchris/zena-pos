import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Menu } from '@headlessui/react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, FunnelIcon, EyeIcon, ArrowDownTrayIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { cashierAPI } from '../services/cashierAPI';
import useCurrency from '../hooks/useCurrency';
import api from '../services/api';
import SaleDetailModal from '../components/SaleDetailModal';

const SaleDetails = ({ sale, onClose }) => {
  return (
    <div className="flex flex-col space-y-4">
      <div className="flex justify-between items-center">
        <span className="font-bold">Invoice #{sale.invoiceNumber}</span>
        <span className={`px-2 py-1 rounded-full text-sm font-medium ${sale.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
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
      <div className="p-4 bg-brand-black shadow-zana rounded-xl border border-zana-borderTint transition-all duration-200 hover:shadow-brand-lg hover:-translate-y-0.5">
        <div className="text-sm text-white/60">Total Sales</div>
        <div className="text-2xl font-semibold mt-1 text-white">{formatCurrency(totalSales)}</div>
        <div className="text-sm mt-2 flex items-center">
          <span className={`mr-1 font-medium ${salesGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {salesGrowth >= 0 ? '↑' : '↓'}
          </span>
          <span className={salesGrowth >= 0 ? 'text-green-400' : 'text-red-400'}>
            {Math.abs(salesGrowth).toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="p-4 bg-brand-black shadow-zana rounded-xl border border-zana-borderTint transition-all duration-200 hover:shadow-brand-lg hover:-translate-y-0.5">
        <div className="text-sm text-white/60">Average Ticket</div>
        <div className="text-2xl font-semibold mt-1 text-white">{formatCurrency(avgTicket)}</div>
        <div className="text-sm text-white/60 mt-2">Per transaction</div>
      </div>

      <div className="p-4 bg-brand-black shadow-zana rounded-xl border border-zana-borderTint transition-all duration-200 hover:shadow-brand-lg hover:-translate-y-0.5">
        <div className="text-sm text-white/60">Total Transactions</div>
        <div className="text-2xl font-semibold mt-1 text-white">{sales.length}</div>
        <div className="text-sm text-white/60 mt-2">For selected period</div>
      </div>
    </div>
  );
};

const MySales = () => {
  const { format: formatCurrency } = useCurrency();
  const { user, shop } = useSelector((state) => state.auth);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const onDrawerOpen = () => setIsDrawerOpen(true);
  const onDrawerClose = () => setIsDrawerOpen(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const handleSaleClick = (sale) => {
    // Get the original sale data from the API response before normalization
    // We need to fetch the sale with full details to show items
    const originalSale = null; // Will need to be fetched separately or stored
    setSelectedSale(sale);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSale(null);
  };

  const handlePrintReceipt = (sale) => {
    // TODO: Implement print functionality
    console.log('Print receipt for sale:', sale.id);
    // window.print() or generate PDF
  };

  const fetchSales = async (page, showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      let response;

      // If admin, fetch all sales from the shop, otherwise fetch user's sales
      if (isAdmin) {
        response = await api.get('/api/sales/admin/all', {
          params: { page, limit: 10 }
        });
      } else {
        response = await cashierAPI.getMySales(page);
      }

      const data = response.data || response; // support either axios response or direct data
      const rows = Array.isArray(data.sales) ? data.sales : [];

      // Keep original sale data for modal, add normalized fields for display
      const normalized = rows.map((s) => {
        const customer = s.customer || s.Customer || null;
        // Backend already provides products array, use it directly
        const products = Array.isArray(s.products) ? s.products : [];
        return {
          ...s, // Keep all original fields for modal
          // Normalized fields for display in table
          customer,
          products,
          totalAmount: parseFloat(s.totalAmount ?? s.total ?? 0),
          subtotal: parseFloat(s.subtotal ?? 0),
          discount: parseFloat(s.discount ?? 0),
          paymentMethod: (s.paymentMethod || 'CASH').toUpperCase(),
          status: (s.status || 'COMPLETED').toUpperCase(),
          employee: s.Employee ? `${s.Employee.firstName || ''} ${s.Employee.lastName || ''}`.trim() : null
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
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSales(currentPage, false);
  };

  useEffect(() => {
    fetchSales(currentPage);
  }, [currentPage, isAdmin, user?.shopId]);

  const handlePageChange = (newPage) => {
    if (newPage > 0 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  return (
    <div className="p-4 space-y-6 bg-brand-black min-h-screen text-white">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-zana-yellow tracking-tight">
          {isAdmin ? 'All Sales' : 'My Sales History'}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center px-4 py-2 border border-zana-borderTint rounded-lg shadow-sm bg-brand-black text-sm font-medium text-white hover:bg-zana-yellow/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-yellow disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ArrowPathIcon className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <div className="inline-flex rounded-lg shadow-sm">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="inline-flex items-center px-3 py-2 rounded-l-lg border border-zana-borderTint bg-brand-black text-sm font-medium text-white/70 hover:bg-zana-yellow/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="inline-flex items-center px-3 py-2 rounded-r-lg border border-l-0 border-zana-borderTint bg-brand-black text-sm font-medium text-white/70 hover:bg-zana-yellow/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-brand-black rounded-xl border border-zana-borderTint shadow-zana overflow-hidden">
        <div className="overflow-x-auto">
          {!loading && sales.length === 0 ? (
            <div className="p-12 text-center text-white/60">
              <div className="mx-auto h-12 w-12 text-white/40 mb-4">
                <ArrowDownTrayIcon className="h-12 w-12" />
              </div>
              <h3 className="text-lg font-medium text-white mb-1">No sales found</h3>
              <p className="text-sm">{isAdmin ? 'Sales from all cashiers will appear here.' : 'Your completed sales will appear here.'}</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-zana-borderTint">
              <thead className="bg-black/40 backdrop-blur-sm sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">Invoice #</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">Items</th>
                  <th className="px-4 py-3.5 text-right text-xs font-semibold text-white/70 uppercase tracking-wider">Total</th>
                  {isAdmin && <th className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">Cashier</th>}
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">Payment</th>
                  <th className="px-4 py-3.5 text-left text-xs font-semibold text-white/70 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zana-borderTint bg-transparent">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(isAdmin ? 8 : 7)].map((_, j) => (
                        <td key={j} className="px-4 py-4 whitespace-nowrap">
                          <div className="h-4 bg-white/10 rounded animate-pulse"></div>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  sales.map((sale) => (
                    <tr
                      key={sale.id}
                      onClick={() => handleSaleClick(sale)}
                      className="cursor-pointer hover:bg-zana-yellow/10 transition-colors duration-150 group"
                    >
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-white/70">
                        {format(new Date(sale.createdAt), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-white group-hover:text-zana-yellow transition-colors">
                        {sale.invoiceNumber}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-white/70">
                        {sale.customer?.name || 'Walk-in Customer'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-white/60">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white/80">
                          {(Array.isArray(sale.products) ? sale.products.length : 0)} items
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-white text-right">
                        {formatCurrency(Number(sale.totalAmount) || 0)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-white/70">
                          {sale.employee || 'Unknown'}
                        </td>
                      )}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${(sale.paymentMethod || '').toUpperCase() === 'CASH'
                          ? 'bg-green-900/20 text-green-400 ring-green-500/20'
                          : 'bg-blue-900/20 text-blue-400 ring-blue-500/20'
                          }`}>
                          {(sale.paymentMethod || 'CASH')}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${(sale.status || '').toUpperCase() === 'COMPLETED'
                          ? 'bg-green-900/20 text-green-400 ring-green-500/20'
                          : (sale.status || '').toUpperCase() === 'PENDING'
                            ? 'bg-yellow-900/20 text-yellow-500 ring-yellow-500/20'
                            : 'bg-red-900/20 text-red-400 ring-red-500/20'
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

      {/* Sale Detail Modal */}
      <SaleDetailModal
        sale={selectedSale}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onPrint={handlePrintReceipt}
        shopName={shop?.name || 'My Shop'}
        shop={shop || {}}
      />
    </div>
  );
};

export default MySales;