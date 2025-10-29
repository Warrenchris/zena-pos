import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import forecastingService from '../services/forecasting.service';
import { 
  ShoppingBagIcon,
  CurrencyDollarIcon,
  UsersIcon,
  TagIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  BanknotesIcon,
  ShoppingCartIcon,
  UserGroupIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import BusinessInsights from '../components/financial/BusinessInsights';
import StatsGrid from '../components/dashboard/StatsGrid';
import RevenueChart from '../components/dashboard/RevenueChart';
import VisitorGraph from '../components/dashboard/VisitorGraph';
import OrderTracking from '../components/dashboard/OrderTracking';
import SellingPlatform from '../components/dashboard/SellingPlatform';
import LocationAudience from '../components/dashboard/LocationAudience';
import TopSellingProducts from '../components/dashboard/TopSellingProducts';
import CashierDashboard from './CashierDashboard';
import SaleDetailModal from '../components/SaleDetailModal';
import { formatCurrency, formatDate } from '../utils/formatters';
import { fetchSalesStatistics, fetchSales } from '../store/slices/salesSlice';
import { fetchCustomers } from '../store/slices/customersSlice';
import { fetchProducts } from '../store/slices/productsSlice';
import api from '../services/api';
import { notifyLowStock } from '../utils/notifications';

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useSelector((state) => state.auth);
  const { sales, statistics, loading: salesLoading, error: salesError } = useSelector((state) => state.sales);
  const { customers, loading: customersLoading, error: customersError } = useSelector((state) => state.customers);
  const { products, loading: productsLoading, error: productsError } = useSelector((state) => state.products);
  const { shop } = useSelector((state) => state.shop || {});

  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [forecast, setForecast] = useState(null);
  const [forecastError, setForecastError] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSaleClick = (sale) => {
    setSelectedSale(sale);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSale(null);
  };

  const handlePrintReceipt = (sale) => {
    console.log('Print receipt for sale:', sale.id);
    // TODO: Implement print functionality
  };

  const fetchForecast = useCallback(async () => {
    if (forecastLoading) return; // Prevent multiple simultaneous calls
    
    try {
      setForecastLoading(true);
      setForecastError(null);
      
      // Only attempt forecast if we have statistics
      if (!statistics?.totalRevenue) {
        setForecast({ next: 0 });
        return;
      }

      const dates = [];
      const values = [];
      const end = new Date();
      
      // Generate historical data points
      for (let i = 29; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        dates.push(d.toISOString());
        const dayValue = i === 0 ? statistics.totalRevenue : 0;
        values.push(dayValue);
      }
      
      const data = await forecastingService.getForecast(dates, values);
      
      if (data?.predictions?.length > 0) {
        setForecast({ 
          next: data.predictions[0],
          confidence: {
            lower: data.lower_bounds?.[0] || 0,
            upper: data.upper_bounds?.[0] || 0
          }
        });
      } else {
        setForecast({ next: 0 });
      }
    } catch (error) {
      console.error('Error fetching forecast:', error);
      setForecastError(error?.message || 'Failed to fetch forecast');
      setForecast({ next: 0 });
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    if (insightsLoading) return; // Prevent multiple simultaneous calls
    
    try {
      setInsightsLoading(true);
      const response = await api.get('/api/insights');
      const data = response?.data || {};
      
      // Transform and validate insights data
      const validInsights = (data.insights || [])
        .filter(insight => insight?.message && insight?.type) // Only include valid insights
        .map(insight => ({
          ...insight,
          message: insight.message,
          type: insight.type || 'info',
          timestamp: insight.timestamp || new Date().toISOString(),
          priority: insight.priority || 'medium'
        }))
        .sort((a, b) => {
          // Sort by priority and timestamp
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
          if (priorityDiff !== 0) return priorityDiff;
          return new Date(b.timestamp) - new Date(a.timestamp);
        });

      setInsights(validInsights);
    } catch (error) {
      console.error('Error fetching insights:', error);
      // Set empty insights array on error
      setInsights([]);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadDashboardData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      // Check if user is authenticated
      if (!user) {
        console.log('User not authenticated, skipping data fetch');
        return;
      }

      // Additional check: ensure user has shopId
      const userShopId = user.shopId || user.shop?.id;
      if (!userShopId) {
        console.error('User has no shopId, cannot fetch data');
        return;
      }

      try {
        await Promise.all([
          dispatch(fetchSalesStatistics()),
          dispatch(fetchSales({ limit: 5 })),
          dispatch(fetchCustomers({ limit: 5 })),
          dispatch(fetchProducts({ limit: 5 }))
        ]);
        
        // Only fetch insights and forecast after main data is loaded
        await fetchInsights();
        await fetchForecast();
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    loadDashboardData();
  }, [dispatch, user]); // Re-run when user changes

  // Check for low stock products
  useEffect(() => {
    if (products && products.length > 0) {
      const lowStockProducts = products.filter(product => 
        product.stockQuantity <= product.reorderPoint && product.active
      );
      
      if (lowStockProducts.length > 0 && user?.role === 'admin') {
        lowStockProducts.forEach(product => {
          notifyLowStock(
            product.name,
            product.stockQuantity,
            product.reorderPoint
          );
        });
      }
    }
  }, [products, user]);

  const stats = useMemo(() => [
    {
      name: 'Total Revenue',
      value: formatCurrency(statistics?.totalRevenue || 0),
      icon: BanknotesIcon,
      color: 'bg-blue-500',
      change: statistics?.revenueChange ? `${statistics.revenueChange > 0 ? '+' : ''}${statistics.revenueChange}%` : '0%',
      changeType: statistics?.revenueChange >= 0 ? 'positive' : 'negative',
      subtitle: `vs. ${formatCurrency(statistics?.lastMonthRevenue || 0)} last month`
    },
    {
      name: 'Total Orders',
      value: statistics?.totalOrders || 0,
      icon: ShoppingCartIcon,
      color: 'bg-purple-500',
      change: statistics?.ordersChange ? `${statistics.ordersChange > 0 ? '+' : ''}${statistics.ordersChange}%` : '0%',
      changeType: statistics?.ordersChange >= 0 ? 'positive' : 'negative',
      subtitle: `vs. ${statistics?.lastMonthOrders || 0} last month`
    },
    {
      name: 'Total Customers',
      value: statistics?.totalCustomers || customers.length || 0,
      icon: UsersIcon,
      color: 'bg-green-500',
      change: statistics?.customersChange ? `${statistics.customersChange > 0 ? '+' : ''}${statistics.customersChange}%` : '0%',
      changeType: statistics?.customersChange >= 0 ? 'positive' : 'negative',
      subtitle: `vs. ${statistics?.lastMonthCustomers || 0} last month`
    },
    {
      name: 'Average Order Value',
      value: formatCurrency(statistics?.averageOrderValue || 0),
      icon: CalendarDaysIcon,
      color: 'bg-orange-500',
      change: statistics?.aovChange ? `${statistics.aovChange > 0 ? '+' : ''}${statistics.aovChange}%` : '0%',
      changeType: statistics?.aovChange >= 0 ? 'positive' : 'negative',
      subtitle: `vs. ${formatCurrency(statistics?.lastMonthAOV || 0)} last month`
    }
  ], [statistics, customers.length]);

  // Combined UI flags
  const isLoading = salesLoading || customersLoading || productsLoading;
  const firstError = salesError || customersError || productsError;

  // Allow the user to retry failed loads from the UI
  const retryAll = useCallback(() => {
    dispatch(fetchSalesStatistics());
    dispatch(fetchSales({ limit: 5 }));
    dispatch(fetchCustomers({ limit: 5 }));
    dispatch(fetchProducts({ limit: 5 }));
  }, [dispatch]);

  // Show loading while authentication is being verified
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show login prompt
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome to Zana POS
          </h1>
          <p className="text-gray-600 mt-2">
            Please log in to access your dashboard.
          </p>
          <div className="mt-4">
            <button 
              onClick={() => navigate('/login')}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user doesn't have shopId, show error
  const userShopId = user.shopId || user.shop?.id;
  if (!userShopId) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-3xl font-bold text-red-900">
            Authentication Error
          </h1>
          <p className="text-red-600 mt-2">
            Your account is not properly configured. Please contact support.
          </p>
          <div className="mt-4">
            <button 
              onClick={() => {
                localStorage.removeItem('token');
                navigate('/login');
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
            >
              Logout and Login Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Only render cashier dashboard for non-admin users
  if (user?.role !== 'admin') {
    return <CashierDashboard />;
  }

  return (
    <div className="space-y-6 bg-brand-black text-white min-h-screen p-6">
      {/* Welcome Header */}
      <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint p-6">
        <h1 className="text-3xl font-bold text-zana-yellow">
          Welcome back, {user?.name || 'User'}!
        </h1>
        <p className="text-white/70 mt-2">
          Here's what's happening with your business today.
        </p>
      </div>

      {/* Loading & error states for the whole dashboard */}
      {isLoading && (
        <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint p-6">
          <p className="text-white/80">Loading latest data...</p>
          <div className="mt-4 h-2 w-full bg-black/40 rounded overflow-hidden">
            <div className="h-2 bg-zana-yellow animate-pulse" style={{ width: '65%' }} />
          </div>
        </div>
      )}

      {!isLoading && firstError && (
        <div className="bg-black/40 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 font-medium">We couldn't load the dashboard data.</p>
          <p className="text-red-300 text-sm mt-1">{firstError}</p>
          <button onClick={retryAll} className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {/* Enhanced Stats Grid */}
      <StatsGrid />

      {/* Revenue and Visitors Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueChart />
        <VisitorGraph />
      </div>

      {/* Orders and Platform Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OrderTracking />
        <SellingPlatform />
      </div>

      {/* Location and Products Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <LocationAudience />
        </div>
        <div className="lg:col-span-2">
          <TopSellingProducts />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint">
          <div className="p-6 border-b border-zana-borderTint">
            <h3 className="text-lg font-medium text-zana-yellow">Recent Sales</h3>
          </div>
          <div className="p-6">
            {salesLoading ? (
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <div className="h-4 w-24 bg-black/40 rounded"></div>
                      <div className="h-3 w-32 bg-black/40 rounded mt-2"></div>
                    </div>
                    <div className="text-right">
                      <div className="h-4 w-20 bg-black/40 rounded"></div>
                      <div className="h-3 w-24 bg-black/40 rounded mt-2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : salesError ? (
              <div className="text-center py-6">
                <p className="text-red-400 mb-2">Error loading recent sales</p>
                <p className="text-white/60 text-sm">{salesError}</p>
              </div>
            ) : !sales || sales.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-white/60">No recent sales</p>
                <p className="text-white/60 text-sm">Create a sale from the POS to see it here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(Array.isArray(sales) ? sales : []).slice(0, 5).map((sale) => (
                  <div 
                    key={sale.id} 
                    onClick={() => handleSaleClick(sale)}
                    className="flex justify-between items-center hover:bg-zana-yellow/10 p-2 rounded transition-colors cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {sale.invoiceNumber}
                      </p>
                      <p className="text-sm text-white/60">
                        {sale.Customer?.name || sale.customer?.name || 'Walk-in Customer'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-white">
                        {formatCurrency(sale.total)}
                      </p>
                      <p className="text-sm text-white/60">
                        {formatDate(sale.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Products */}
        <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint">
          <div className="p-6 border-b border-zana-borderTint">
            <h3 className="text-lg font-medium text-zana-yellow">Low Stock Alert</h3>
          </div>
          <div className="p-6">
            {productsLoading ? (
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <div className="h-4 w-32 bg-black/40 rounded"></div>
                      <div className="h-3 w-24 bg-black/40 rounded mt-2"></div>
                    </div>
                    <div className="text-right">
                      <div className="h-4 w-16 bg-black/40 rounded"></div>
                      <div className="h-3 w-20 bg-black/40 rounded mt-2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : products.filter(p => p.stockQuantity <= p.reorderPoint).length === 0 ? (
              <div className="text-center py-6">
                <p className="text-white/60">All products are well stocked!</p>
                <p className="text-white/60 text-sm">Update stock levels from the Products page.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {products
                  .filter(p => p.stockQuantity <= p.reorderPoint)
                  .slice(0, 5)
                  .map((product) => (
                    <div key={product.id} className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {product.name}
                        </p>
                        <p className="text-sm text-white/60">
                          SKU: {product.sku}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-red-400">
                          {product.stockQuantity} left
                        </p>
                        <p className="text-sm text-white/60">
                          Reorder: {product.reorderPoint}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Insights Section */}
      <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-zana-yellow">AI Business Insights</h3>
          <button className="text-sm text-zana-yellow hover:text-zana-yellow/80">
            View All
          </button>
        </div>
        {forecastLoading ? (
          <div className="mb-4 p-4 rounded border border-zana-borderTint bg-black/40">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-zana-yellow mr-3"></div>
              <span className="text-zana-yellow">Loading forecast...</span>
            </div>
          </div>
        ) : forecastError ? (
          <div className="mb-4 p-4 rounded border border-red-500/30 bg-black/40">
            <div className="text-sm text-red-400">Error loading forecast</div>
            <div className="text-red-300">{forecastError}</div>
            <button 
              onClick={fetchForecast}
              className="mt-2 text-sm text-red-400 hover:text-red-300 underline"
            >
              Retry
            </button>
          </div>
        ) : forecast && (
          <div className="mb-4 p-4 rounded border border-zana-borderTint bg-black/40">
            <div className="text-sm text-white/70">Forecast</div>
            <div className="text-xl font-semibold">Next period expected sales: {formatCurrency(forecast.next || 0)}</div>
          </div>
        )}
        {insightsLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zana-yellow"></div>
          </div>
        ) : (
          <BusinessInsights insights={insights} />
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint p-6">
        <h3 className="text-lg font-medium text-zana-yellow mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button 
            onClick={() => navigate('/pos')}
            className="p-4 border border-zana-borderTint rounded-lg hover:bg-zana-yellow/10 text-center transition-colors"
          >
            <ShoppingBagIcon className="h-8 w-8 text-zana-yellow mx-auto mb-2" />
            <p className="text-sm font-medium text-white">New Sale</p>
          </button>
          <button 
            onClick={() => navigate('/products/new')}
            className="p-4 border border-zana-borderTint rounded-lg hover:bg-zana-yellow/10 text-center transition-colors"
          >
            <TagIcon className="h-8 w-8 text-zana-yellow mx-auto mb-2" />
            <p className="text-sm font-medium text-white">Add Product</p>
          </button>
          <button 
            onClick={() => navigate('/customers/new')}
            className="p-4 border border-zana-borderTint rounded-lg hover:bg-zana-yellow/10 text-center transition-colors"
          >
            <UsersIcon className="h-8 w-8 text-zana-yellow mx-auto mb-2" />
            <p className="text-sm font-medium text-white">Add Customer</p>
          </button>
          <button 
            onClick={() => navigate('/reports')}
            className="p-4 border border-zana-borderTint rounded-lg hover:bg-zana-yellow/10 text-center transition-colors"
          >
            <ChartBarIcon className="h-8 w-8 text-zana-yellow mx-auto mb-2" />
            <p className="text-sm font-medium text-white">View Reports</p>
          </button>
        </div>
      </div>

      {/* Sale Detail Modal */}
      <SaleDetailModal
        sale={selectedSale}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onPrint={handlePrintReceipt}
        shopName={user?.shop?.name || 'My Shop'}
        shop={user?.shop}
      />
    </div>
  );
}