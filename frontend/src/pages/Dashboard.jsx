import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import forecastingService from '../services/forecasting.service';
import {
  ShoppingBagIcon,
  UsersIcon,
  TagIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { lazy, Suspense } from 'react';
import BusinessInsights from '../components/financial/BusinessInsights';
import StatsGrid from '../components/dashboard/StatsGrid';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';

// Lazy load chart components to reduce initial bundle size
const RevenueChart = lazy(() => import('../components/dashboard/RevenueChart'));
const VisitorGraph = lazy(() => import('../components/dashboard/VisitorGraph'));
const OrderTracking = lazy(() => import('../components/dashboard/OrderTracking'));
const SellingPlatform = lazy(() => import('../components/dashboard/SellingPlatform'));
const LocationAudience = lazy(() => import('../components/dashboard/LocationAudience'));
const TopSellingProducts = lazy(() => import('../components/dashboard/TopSellingProducts'));
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
  const { loading: customersLoading, error: customersError } = useSelector((state) => state.customers);
  const { products, loading: productsLoading, error: productsError } = useSelector((state) => state.products);

  const userId = user?.id;
  const userRole = user?.role;
  const userShopId = user?.shopId || user?.shop?.id;

  const [insights, setInsights] = useState(null);
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

  const statisticsRef = React.useRef(statistics);
  statisticsRef.current = statistics;
  const notifiedProductsRef = React.useRef(new Set());

  const fetchInsights = useCallback(async () => {
    try {
      setInsightsLoading(true);
      const response = await api.get('/api/insights');
      setInsights(response?.data || null);
    } catch (error) {
      console.error('Error fetching insights:', error);
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const fetchForecast = useCallback(async (currentStats) => {
    const statsToUse = currentStats || statisticsRef.current;

    try {
      setForecastLoading(true);
      setForecastError(null);

      // Only attempt forecast if we have statistics
      if (!statsToUse?.totalRevenue) {
        setForecast({ next: 0 });
        setForecastLoading(false); // Clear loading state before early return
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
        const dayValue = i === 0 ? statsToUse.totalRevenue : 0;
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

  useEffect(() => {
    const loadDashboardData = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No auth token found');
        return;
      }

      // Check if user is authenticated
      if (!userId) {
        console.log('User not authenticated, skipping data fetch');
        return;
      }

      // Additional check: ensure user has shopId
      if (!userShopId) {
        console.error('User has no shopId, cannot fetch data');
        return;
      }

      try {
        const [statsResult] = await Promise.all([
          dispatch(fetchSalesStatistics()).unwrap(),
          dispatch(fetchSales({ limit: 5 })),
          dispatch(fetchCustomers({ limit: 5 })),
          dispatch(fetchProducts({ limit: 5 }))
        ]);

        // Only fetch insights and forecast after main data is loaded
        await fetchInsights();
        await fetchForecast(statsResult);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    loadDashboardData();
  }, [dispatch, userId, userShopId, fetchInsights, fetchForecast]);

  // Check for low stock products
  useEffect(() => {
    if (products && products.length > 0) {
      const lowStockProducts = products.filter(product =>
        product.stockQuantity <= product.reorderPoint && product.active
      );

      if (lowStockProducts.length > 0 && userRole === 'admin') {
        lowStockProducts.forEach(product => {
          if (!notifiedProductsRef.current.has(product.id)) {
            notifyLowStock(
              product.name,
              product.stockQuantity,
              product.reorderPoint
            );
            notifiedProductsRef.current.add(product.id);
          }
        });
      }
    }
  }, [products, userRole]);


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
    <div className="space-y-6 min-h-screen">
      {/* Welcome Header */}
      <Card variant="default" className="p-6">
        <h1 className="text-h2 font-bold text-primary">
          Welcome back, {user?.name || 'User'}!
        </h1>
        <p className="text-text-secondary mt-1 text-body">
          Here's what's happening with your business today.
        </p>
      </Card>

      {/* Loading & error states for the whole dashboard */}
      {isLoading && (
        <Card variant="default" className="p-6">
          <div className="flex items-center gap-3" role="status">
            <Spinner size="md" />
            <p className="text-text-secondary font-medium">Loading latest data...</p>
          </div>
        </Card>
      )}

      {!isLoading && firstError && (
        <div role="alert" className="bg-danger/10 border border-danger/30 rounded-xl p-4">
          <p className="text-danger font-medium">We couldn't load the dashboard data.</p>
          <p className="text-text-muted text-small mt-1">{firstError}</p>
          <Button onClick={retryAll} variant="danger" size="sm" className="mt-3">
            Retry
          </Button>
        </div>
      )}

      {/* Enhanced Stats Grid */}
      <StatsGrid />

      {/* Revenue and Visitors Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading revenue chart..." /></Card>}>
          <RevenueChart />
        </Suspense>
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading visitor graph..." /></Card>}>
          <VisitorGraph />
        </Suspense>
      </div>

      {/* Orders and Platform Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading order tracking..." /></Card>}>
          <OrderTracking />
        </Suspense>
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading selling platform..." /></Card>}>
          <SellingPlatform />
        </Suspense>
      </div>

      {/* Location and Products Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading audience location..." /></Card>}>
            <LocationAudience />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading top products..." /></Card>}>
            <TopSellingProducts />
          </Suspense>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <Card variant="default">
          <Card.Header title="Recent Sales" />
          <Card.Body>
            {salesLoading ? (
              <div className="animate-pulse space-y-4" role="status" aria-label="Loading recent sales">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <div className="h-4 w-24 bg-surface-2 rounded"></div>
                      <div className="h-3 w-32 bg-surface-2 rounded mt-2"></div>
                    </div>
                    <div className="text-right">
                      <div className="h-4 w-20 bg-surface-2 rounded"></div>
                      <div className="h-3 w-24 bg-surface-2 rounded mt-2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : salesError ? (
              <div className="text-center py-6" role="alert">
                <p className="text-danger mb-1 font-medium">Error loading recent sales</p>
                <p className="text-text-muted text-small">{salesError}</p>
              </div>
            ) : !sales || sales.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-text-secondary font-medium">No recent sales</p>
                <p className="text-text-muted text-small mt-1">Create a sale from the POS to see it here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(Array.isArray(sales) ? sales : []).slice(0, 5).map((sale) => (
                  <div
                    key={sale.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSaleClick(sale)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSaleClick(sale);
                      }
                    }}
                    className="flex justify-between items-center hover:bg-surface-2 p-3 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  >
                    <div>
                      <p className="text-body font-medium text-text-primary">
                        {sale.invoiceNumber}
                      </p>
                      <p className="text-small text-text-muted">
                        {sale.Customer?.name || sale.customer?.name || 'Walk-in Customer'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-body font-semibold text-primary">
                        {formatCurrency(sale.total)}
                      </p>
                      <p className="text-caption text-text-muted">
                        {formatDate(sale.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>

        {/* Low Stock Products */}
        <Card variant="default">
          <Card.Header title="Low Stock Alert" />
          <Card.Body>
            {productsLoading ? (
              <div className="animate-pulse space-y-4" role="status" aria-label="Loading low stock products">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex justify-between items-center">
                    <div>
                      <div className="h-4 w-32 bg-surface-2 rounded"></div>
                      <div className="h-3 w-24 bg-surface-2 rounded mt-2"></div>
                    </div>
                    <div className="text-right">
                      <div className="h-4 w-16 bg-surface-2 rounded"></div>
                      <div className="h-3 w-20 bg-surface-2 rounded mt-2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : products.filter(p => p.stockQuantity <= p.reorderPoint).length === 0 ? (
              <div className="text-center py-6">
                <p className="text-text-secondary font-medium">All products are well stocked!</p>
                <p className="text-text-muted text-small mt-1">Update stock levels from the Products page.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {products
                  .filter(p => p.stockQuantity <= p.reorderPoint)
                  .slice(0, 5)
                  .map((product) => (
                    <div
                      key={product.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate('/products')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate('/products');
                        }
                      }}
                      className="flex justify-between items-center hover:bg-surface-2 p-3 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <div>
                        <p className="text-body font-medium text-text-primary">
                          {product.name}
                        </p>
                        <p className="text-small text-text-muted">
                          SKU: {product.sku}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-body font-semibold text-danger">
                          {product.stockQuantity} left
                        </p>
                        <p className="text-caption text-text-muted">
                          Reorder: {product.reorderPoint}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card.Body>
        </Card>
      </div>

      {/* AI Insights Section */}
      <Card variant="default">
        <Card.Header
          title="AI Business Insights"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/ai/insights')}
            >
              View All
            </Button>
          }
        />
        <Card.Body>
          {forecastLoading ? (
            <div className="mb-4 p-4 rounded-lg border border-border-default bg-surface-2 flex items-center justify-center gap-3" role="status">
              <Spinner size="sm" />
              <span className="text-primary text-small font-medium">Loading forecast...</span>
            </div>
          ) : forecastError ? (
            <div role="alert" className="mb-4 p-4 rounded-lg border border-danger/30 bg-surface-2">
              <div className="text-small text-danger font-medium">Error loading forecast</div>
              <div className="text-danger/80 text-caption mt-1">{forecastError}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchForecast}
                className="mt-2 text-danger hover:text-danger/80"
              >
                Retry
              </Button>
            </div>
          ) : forecast && (
            <div className="mb-4 p-4 rounded-lg border border-border-default bg-surface-2">
              <div className="text-caption text-text-muted uppercase tracking-wider font-medium">Forecast</div>
              <div className="text-h4 font-semibold text-text-primary mt-1">Next period expected sales: {formatCurrency(forecast.next || 0)}</div>
            </div>
          )}
          {insightsLoading ? (
            <div className="flex justify-center items-center h-32" role="status">
              <Spinner size="lg" label="Loading insights..." />
            </div>
          ) : (
            <BusinessInsights insights={insights} />
          )}
        </Card.Body>
      </Card>

      {/* Quick Actions */}
      <Card variant="default">
        <Card.Header title="Quick Actions" />
        <Card.Body>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => navigate('/pos')}
              className="p-5 border border-border-default rounded-xl hover:bg-surface-2 hover:border-border-hover text-center transition-all duration-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ShoppingBagIcon className="h-8 w-8 text-primary mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-body font-semibold text-text-primary">New Sale</p>
            </button>
            <button
              onClick={() => navigate('/products/new')}
              className="p-5 border border-border-default rounded-xl hover:bg-surface-2 hover:border-border-hover text-center transition-all duration-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <TagIcon className="h-8 w-8 text-primary mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-body font-semibold text-text-primary">Add Product</p>
            </button>
            <button
              onClick={() => navigate('/customers/new')}
              className="p-5 border border-border-default rounded-xl hover:bg-surface-2 hover:border-border-hover text-center transition-all duration-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <UsersIcon className="h-8 w-8 text-primary mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-body font-semibold text-text-primary">Add Customer</p>
            </button>
            <button
              onClick={() => navigate('/reports')}
              className="p-5 border border-border-default rounded-xl hover:bg-surface-2 hover:border-border-hover text-center transition-all duration-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ChartBarIcon className="h-8 w-8 text-primary mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <p className="text-body font-semibold text-text-primary">View Reports</p>
            </button>
          </div>
        </Card.Body>
      </Card>

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