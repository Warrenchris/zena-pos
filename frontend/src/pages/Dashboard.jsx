import React, { useEffect, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import forecastingService from '../services/forecasting.service';
import {
  ShoppingBagIcon,
  UsersIcon,
  TagIcon,
  ChartBarIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import { lazy, Suspense } from 'react';
import BusinessInsights from '../components/financial/BusinessInsights';
import StatsGrid from '../components/dashboard/StatsGrid';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { WALK_IN_CUSTOMER_NAME } from '../constants/customer';

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
import api, { employeesAPI } from '../services/api';
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

  const formatLocalDate = (d) => {
    if (!d) return '';
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const [period, setPeriod] = useState('week');
  const [startDate, setStartDate] = useState(() => formatLocalDate(new Date()));
  const [endDate, setEndDate] = useState(() => formatLocalDate(new Date()));
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const res = await employeesAPI.getAll();
        setEmployees(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Failed to load employees for dashboard filter:', err);
      }
    };
    if (userRole === 'admin') {
      loadEmployees();
    }
  }, [userRole]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dashboardFilter = React.useMemo(() => ({
    period,
    employeeId: employeeId || undefined,
    startDate: period === 'custom' ? startDate : undefined,
    endDate: period === 'custom' ? endDate : undefined,
    _refresh: refreshKey
  }), [period, employeeId, startDate, endDate, refreshKey]);

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

  const loadDashboardData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || !userId || !userShopId) {
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
  }, [dispatch, userId, userShopId, fetchInsights, fetchForecast]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setRefreshKey((prev) => prev + 1);
      await loadDashboardData();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadDashboardData]);

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
        <div className="bg-surface rounded-2xl border border-border-default shadow-floating p-6">
          <h1 className="text-3xl font-bold text-text-primary">
            Welcome to Zana POS
          </h1>
          <p className="text-text-secondary mt-2">
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
      {/* Welcome Header with Integrated Filter Options & Quick Actions */}
      <Card variant="default" className="p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-h3 font-bold text-text-primary tracking-tight">
              {getTimeOfDayGreeting()}, {user?.name || 'User'}!
            </h1>
            <p className="text-text-secondary mt-1 text-body">
              Here is what is happening across your retail operations today.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="primary"
              leftIcon={ShoppingBagIcon}
              onClick={() => navigate('/pos')}
            >
              New Sale
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={TagIcon}
              onClick={() => navigate('/products/new')}
            >
              Add Product
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={UsersIcon}
              onClick={() => navigate('/customers/new')}
            >
              Add Customer
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={ChartBarIcon}
              onClick={() => navigate('/reports')}
            >
              View Reports
            </Button>

            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="h-9 rounded-xl border border-border-default px-3 bg-surface text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              aria-label="Filter by employee"
            >
              <option value="">All Employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {`${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.name || emp.email || emp.id}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-border-default bg-surface hover:bg-surface-2 active:bg-surface-3 text-text-primary text-small font-medium transition-colors disabled:opacity-50 shadow-2xs"
              title="Refresh Dashboard Data"
            >
              <ArrowPathIcon className={`h-4 w-4 text-text-secondary ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
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
      <StatsGrid
        filter={dashboardFilter}
        period={period}
        onPeriodChange={setPeriod}
        startDate={startDate}
        endDate={endDate}
        onDateChange={([start, end]) => {
          if (start) {
            setStartDate(formatLocalDate(start));
            setEndDate(formatLocalDate(end || start));
          }
        }}
      />

      {/* Revenue and Visitors Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading revenue chart..." /></Card>}>
          <RevenueChart filter={dashboardFilter} />
        </Suspense>
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading visitor graph..." /></Card>}>
          <VisitorGraph filter={dashboardFilter} />
        </Suspense>
      </div>

      {/* Orders and Platform Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading order tracking..." /></Card>}>
          <OrderTracking filter={dashboardFilter} />
        </Suspense>
        <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading selling platform..." /></Card>}>
          <SellingPlatform filter={dashboardFilter} />
        </Suspense>
      </div>

      {/* Location and Products Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading audience location..." /></Card>}>
            <LocationAudience filter={dashboardFilter} />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense fallback={<Card variant="default" className="h-[400px] flex items-center justify-center"><Spinner size="lg" label="Loading top products..." /></Card>}>
            <TopSellingProducts filter={dashboardFilter} />
          </Suspense>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <Card variant="default">
          <Card.Header
            title="Recent Sales"
            action={
              <button
                onClick={() => navigate('/sales')}
                className="text-caption font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                View All →
              </button>
            }
          />
          <Card.Body>
            {salesLoading ? (
              <div className="animate-pulse space-y-3" role="status" aria-label="Loading recent sales">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="h-9 w-9 rounded-full bg-surface-2 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-28 bg-surface-2 rounded" />
                      <div className="h-3 w-20 bg-surface-2/70 rounded" />
                    </div>
                    <div className="text-right space-y-1.5">
                      <div className="h-4 w-20 bg-surface-2 rounded" />
                      <div className="h-3 w-16 bg-surface-2/70 rounded ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : salesError ? (
              <div className="text-center py-8" role="alert">
                <p className="text-danger mb-1 font-medium">Error loading recent sales</p>
                <p className="text-text-muted text-small">{salesError}</p>
              </div>
            ) : !sales || sales.length === 0 ? (
              <div className="text-center py-10">
                <ShoppingBagIcon className="h-10 w-10 text-text-muted/40 mx-auto mb-2" />
                <p className="text-text-secondary font-medium">No recent sales</p>
                <p className="text-text-muted text-small mt-1">Create a sale from the POS to see it here.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {(Array.isArray(sales) ? sales : []).slice(0, 5).map((sale) => {
                  const customerName = sale.Customer?.name || sale.customer?.name || WALK_IN_CUSTOMER_NAME;
                  const initials = customerName
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                  const method = (sale.paymentMethod || 'cash').toLowerCase();
                  const methodLabel = method === 'mpesa' || method === 'mobile' ? 'M-Pesa'
                    : method === 'card' ? 'Card'
                    : 'Cash';
                  const methodColors = method === 'mpesa' || method === 'mobile'
                    ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300'
                    : method === 'card'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'bg-surface-2 text-text-secondary';

                  return (
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
                      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-2/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group"
                    >
                      {/* Customer avatar */}
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[12px] font-bold text-primary">{initials}</span>
                      </div>

                      {/* Name + invoice */}
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium text-text-primary truncate">
                          {customerName}
                        </p>
                        <p className="text-caption text-text-muted">
                          {sale.invoiceNumber}
                        </p>
                      </div>

                      {/* Payment method badge */}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${methodColors}`}>
                        {methodLabel}
                      </span>

                      {/* Amount + date */}
                      <div className="text-right shrink-0">
                        <p className="text-body font-bold text-primary">
                          {formatCurrency(sale.total)}
                        </p>
                        <p className="text-caption text-text-muted">
                          {formatDate(sale.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card.Body>
        </Card>

        {/* Low Stock Alert */}
        <Card variant="default">
          <Card.Header
            title="Low Stock Alert"
            action={
              <button
                onClick={() => navigate('/products')}
                className="text-caption font-semibold text-danger hover:text-danger/80 transition-colors"
              >
                Manage Stock →
              </button>
            }
          />
          <Card.Body>
            {productsLoading ? (
              <div className="animate-pulse space-y-3" role="status" aria-label="Loading low stock products">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="h-9 w-9 rounded-lg bg-surface-2 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-32 bg-surface-2 rounded" />
                      <div className="h-2 w-full bg-surface-2/60 rounded-full" />
                    </div>
                    <div className="h-6 w-16 bg-surface-2 rounded-full" />
                  </div>
                ))}
              </div>
            ) : products.filter(p => p.stockQuantity <= p.reorderPoint).length === 0 ? (
              <div className="text-center py-10">
                <CubeIcon className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-text-secondary font-medium">All products are well stocked!</p>
                <p className="text-text-muted text-small mt-1">Stock levels are looking healthy across your inventory.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {products
                  .filter(p => p.stockQuantity <= p.reorderPoint)
                  .slice(0, 5)
                  .map((product) => {
                    const isCritical = product.stockQuantity === 0;
                    const isVeryLow = product.stockQuantity > 0 && product.stockQuantity <= Math.ceil(product.reorderPoint * 0.5);
                    const urgencyLabel = isCritical ? 'Out of Stock' : isVeryLow ? 'Critical' : 'Low Stock';
                    const urgencyColors = isCritical
                      ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                      : isVeryLow
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300';
                    const stockFillPct = product.reorderPoint > 0
                      ? Math.min((product.stockQuantity / (product.reorderPoint * 2)) * 100, 100)
                      : 0;
                    const barColor = isCritical ? 'bg-red-500' : isVeryLow ? 'bg-orange-500' : 'bg-amber-400';

                    return (
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
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-surface-2/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 group"
                      >
                        {/* Product icon */}
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isCritical ? 'bg-red-100 dark:bg-red-950/40' : 'bg-amber-50 dark:bg-amber-950/30'
                        }`}>
                          {isCritical
                            ? <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                            : <CubeIcon className="h-5 w-5 text-amber-500" />
                          }
                        </div>

                        {/* Name + stock fill bar */}
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium text-text-primary truncate">
                            {product.name}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 flex-1 bg-surface-2 rounded-full overflow-hidden">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-500 ${barColor}`}
                                style={{ width: `${stockFillPct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-text-muted shrink-0">
                              {product.stockQuantity}/{product.reorderPoint}
                            </span>
                          </div>
                        </div>

                        {/* Urgency badge */}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${urgencyColors}`}>
                          {urgencyLabel}
                        </span>
                      </div>
                    );
                  })}
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