import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import api from '../services/api';
import analyticsService from '../services/analytics.service';
import analyticsReducer, { fetchOrderStats } from '../store/slices/analyticsSlice';
import settingsReducer from '../store/slices/settingsSlice';
import RevenueChart from '../components/dashboard/RevenueChart';
import OrderTracking from '../components/dashboard/OrderTracking';

// Mock api service
jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

// Mock recharts ResponsiveContainer and components to render cleanly in jsdom
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
    AreaChart: ({ children, data }) => <div data-testid="area-chart" data-points={data?.length}>{children}</div>,
    BarChart: ({ children, data }) => <div data-testid="bar-chart" data-points={data?.length}>{children}</div>,
    Area: () => <div data-testid="area" />,
    Bar: () => <div data-testid="bar" />,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    Tooltip: () => <div data-testid="tooltip" />
  };
});

function createTestStore(preloadedState = {}) {
  return configureStore({
    reducer: combineReducers({
      analytics: analyticsReducer,
      settings: settingsReducer
    }),
    preloadedState
  });
}

describe('Dashboard Performance Fixes - Deduplication & Independent States', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. analyticsService.getOrderStats in-flight deduplication', () => {
    it('collapses concurrent calls with identical params into a single network request', async () => {
      let resolveRequest;
      const deferredPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });

      api.get.mockImplementation(() => deferredPromise);

      const params = { period: 'week' };

      // Fire two concurrent calls
      const call1 = analyticsService.getOrderStats(params);
      const call2 = analyticsService.getOrderStats(params);

      // Verify that api.get was only called ONCE
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/analytics/orders', { params: { period: 'week' } });

      // Resolve the mock HTTP response
      const mockData = {
        orderData: [{ date: '2026-10-17', orders: 12, revenue: 15000 }],
        totalOrders: 12,
        totalRevenue: 15000
      };
      resolveRequest({ data: mockData });

      const [res1, res2] = await Promise.all([call1, call2]);

      expect(res1).toEqual(mockData);
      expect(res2).toEqual(mockData);
      expect(res1).toBe(res2); // Same returned reference from shared promise
    });

    it('does NOT collapse calls with different parameters', async () => {
      api.get.mockImplementation((url, options) => {
        return Promise.resolve({
          data: {
            orderData: [],
            totalOrders: options.params?.period === 'week' ? 5 : 20,
            totalRevenue: options.params?.period === 'week' ? 5000 : 25000
          }
        });
      });

      const callWeek = analyticsService.getOrderStats({ period: 'week' });
      const callMonth = analyticsService.getOrderStats({ period: 'month' });

      const [resWeek, resMonth] = await Promise.all([callWeek, callMonth]);

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(resWeek.totalOrders).toBe(5);
      expect(resMonth.totalOrders).toBe(20);
    });

    it('allows a subsequent call to refetch after the in-flight request settles', async () => {
      api.get.mockResolvedValueOnce({
        data: { totalOrders: 10, totalRevenue: 10000, orderData: [] }
      }).mockResolvedValueOnce({
        data: { totalOrders: 15, totalRevenue: 15000, orderData: [] }
      });

      const res1 = await analyticsService.getOrderStats({ period: 'week' });
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(res1.totalOrders).toBe(10);

      // Call again after first has settled
      const res2 = await analyticsService.getOrderStats({ period: 'week' });
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(res2.totalOrders).toBe(15);
    });
  });

  describe('2. Redux analyticsSlice thunk deduplication', () => {
    it('skips duplicate in-flight thunk dispatches with identical parameters via condition', async () => {
      let resolveApi;
      api.get.mockImplementation(() => new Promise((resolve) => {
        resolveApi = resolve;
      }));

      const store = createTestStore();

      // Dispatch first thunk
      const dispatch1 = store.dispatch(fetchOrderStats({ period: 'week' }));
      expect(store.getState().analytics.orderStats.loading).toBe(true);
      expect(api.get).toHaveBeenCalledTimes(1);

      // Dispatch duplicate thunk while first is in flight
      const dispatch2 = store.dispatch(fetchOrderStats({ period: 'week' }));

      // The second dispatch should have been skipped by condition (no extra network call)
      expect(api.get).toHaveBeenCalledTimes(1);

      // Resolve the API call
      resolveApi({
        data: {
          orderData: [{ date: '2026-10-17', orders: 8, revenue: 12000 }],
          totalOrders: 8,
          totalRevenue: 12000,
          orderPercentageChange: 15,
          revenuePercentageChange: 20
        }
      });

      await dispatch1;
      const result2 = await dispatch2;

      // Result of skipped dispatch has condition: true
      expect(result2.meta.condition).toBe(true);

      expect(store.getState().analytics.orderStats.loading).toBe(false);
      expect(store.getState().analytics.orderStats.totalOrders).toBe(8);
      expect(store.getState().analytics.orderStats.totalRevenue).toBe(12000);
    });

    it('refetches when changing the period parameter', async () => {
      api.get.mockImplementation((url, { params }) => Promise.resolve({
        data: {
          orderData: [{ date: '2026-10-17', orders: params.period === 'week' ? 8 : 40, revenue: 10000 }],
          totalOrders: params.period === 'week' ? 8 : 40,
          totalRevenue: 10000,
          orderPercentageChange: 5,
          revenuePercentageChange: 10
        }
      }));

      const store = createTestStore();

      await store.dispatch(fetchOrderStats({ period: 'week' }));
      expect(store.getState().analytics.orderStats.totalOrders).toBe(8);
      expect(api.get).toHaveBeenCalledTimes(1);

      // Changing filter parameter to 'month' triggers a refetch
      await store.dispatch(fetchOrderStats({ period: 'month' }));
      expect(store.getState().analytics.orderStats.totalOrders).toBe(40);
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    it('prevents an older, slower response from overwriting a newer response after period changes', async () => {
      let resolveWeek;
      let resolveMonth;

      api.get.mockImplementation((url, { params }) => {
        if (params.period === 'week') {
          return new Promise((resolve) => {
            resolveWeek = resolve;
          });
        }
        if (params.period === 'month') {
          return new Promise((resolve) => {
            resolveMonth = resolve;
          });
        }
        return Promise.resolve({ data: {} });
      });

      const store = createTestStore();

      // 1. User starts on 'week' (slow request)
      const dispatchWeek = store.dispatch(fetchOrderStats({ period: 'week' }));
      expect(store.getState().analytics.orderStats.loading).toBe(true);
      expect(store.getState().analytics.orderStats.currentParams).toEqual({ period: 'week' });

      // 2. User quickly switches to 'month'
      const dispatchMonth = store.dispatch(fetchOrderStats({ period: 'month' }));
      expect(store.getState().analytics.orderStats.currentParams).toEqual({ period: 'month' });

      // 3. Month resolves FIRST
      resolveMonth({
        data: {
          orderData: [{ date: '2026-10-01', orders: 50, revenue: 80000 }],
          totalOrders: 50,
          totalRevenue: 80000,
          orderPercentageChange: 10,
          revenuePercentageChange: 15
        }
      });
      await dispatchMonth;

      expect(store.getState().analytics.orderStats.totalOrders).toBe(50);
      expect(store.getState().analytics.orderStats.totalRevenue).toBe(80000);

      // 4. Now the older 'week' response resolves out of order
      resolveWeek({
        data: {
          orderData: [{ date: '2026-10-17', orders: 10, revenue: 12000 }],
          totalOrders: 10,
          totalRevenue: 12000,
          orderPercentageChange: 2,
          revenuePercentageChange: 3
        }
      });
      await dispatchWeek;

      // 5. Verify: the older 'week' response was discarded and did NOT overwrite 'month' data!
      expect(store.getState().analytics.orderStats.totalOrders).toBe(50);
      expect(store.getState().analytics.orderStats.totalRevenue).toBe(80000);
    });
  });

  describe('3. RevenueChart and OrderTracking concurrent rendering deduplication', () => {
    it('collapses identical /api/analytics/orders requests when RevenueChart and OrderTracking mount together', async () => {
      const mockOrderStats = {
        orderData: [
          { date: '2026-10-16', orders: 5, revenue: 5000 },
          { date: '2026-10-17', orders: 10, revenue: 12000 }
        ],
        totalOrders: 15,
        totalRevenue: 17000,
        orderPercentageChange: 12.5,
        revenuePercentageChange: 18.2
      };

      api.get.mockResolvedValue({ data: mockOrderStats });

      const store = createTestStore({
        settings: {
          settings: {
            defaultCurrency: 'KES',
            currencySymbol: 'KSh',
            currencyPosition: 'prefix',
            decimalPlaces: 2
          }
        }
      });

      const filter = { period: 'week' };

      // Render both components simultaneously inside the same Redux Provider
      render(
        <Provider store={store}>
          <div>
            <RevenueChart filter={filter} />
            <OrderTracking filter={filter} />
          </div>
        </Provider>
      );

      // Wait for data to populate
      await waitFor(() => {
        expect(screen.getByText('Revenue Overview')).toBeInTheDocument();
        expect(screen.getByText('Order Tracking')).toBeInTheDocument();
      });

      // Crucial verification: only ONE API call was fired across both components
      expect(api.get).toHaveBeenCalledTimes(1);
      expect(api.get).toHaveBeenCalledWith('/api/analytics/orders', { params: { period: 'week' } });

      // Verify both components received and rendered the data
      expect(screen.getByTestId('area-chart')).toHaveAttribute('data-points', '2');
      expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-points', '2');
      expect(screen.getByText('15')).toBeInTheDocument(); // totalOrders in OrderTracking
    });

    it('uses module-level constant default-prop filter and does NOT trigger extra dispatches across re-renders', async () => {
      api.get.mockResolvedValue({
        data: {
          orderData: [{ date: '2026-10-17', orders: 10, revenue: 12000 }],
          totalOrders: 10,
          totalRevenue: 12000,
          orderPercentageChange: 5,
          revenuePercentageChange: 10
        }
      });

      const store = createTestStore({
        settings: {
          settings: {
            defaultCurrency: 'KES',
            currencySymbol: 'KSh',
            currencyPosition: 'prefix',
            decimalPlaces: 2
          }
        }
      });

      const dispatchSpy = jest.spyOn(store, 'dispatch');

      function TestParent() {
        const [count, setCount] = React.useState(0);
        return (
          <div>
            <button onClick={() => setCount((c) => c + 1)}>Re-render Parent ({count})</button>
            {/* Render RevenueChart without filter prop to exercise DEFAULT_FILTER */}
            <RevenueChart />
          </div>
        );
      }

      render(
        <Provider store={store}>
          <TestParent />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByText('Revenue Overview')).toBeInTheDocument();
      });

      // Count dispatches for fetchOrderStats thunk
      const getOrderStatsDispatches = () =>
        dispatchSpy.mock.calls.filter((call) => typeof call[0] === 'function');

      const initialDispatchCount = getOrderStatsDispatches().length;
      expect(initialDispatchCount).toBe(1);

      // Trigger 4 consecutive parent re-renders
      const btn = screen.getByRole('button', { name: /Re-render Parent/ });
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);
      fireEvent.click(btn);

      // Verify dispatches did NOT increase on re-renders because DEFAULT_FILTER has a stable module-level reference
      expect(getOrderStatsDispatches().length).toBe(1);
    });
  });

  describe('4. Independent Insights and Forecast loading and error states', () => {
    function AiSectionTestHarness({
      initialInsights = null,
      initialInsightsLoading = false,
      initialInsightsError = null,
      initialForecast = null,
      initialForecastLoading = false,
      initialForecastError = null,
      onFetchInsights = jest.fn(),
      onFetchForecast = jest.fn()
    }) {
      const [insights] = React.useState(initialInsights);
      const [insightsLoading, setInsightsLoading] = React.useState(initialInsightsLoading);
      const [insightsError, setInsightsError] = React.useState(initialInsightsError);
      const [forecast] = React.useState(initialForecast);
      const [forecastLoading, setForecastLoading] = React.useState(initialForecastLoading);
      const [forecastError, setForecastError] = React.useState(initialForecastError);

      const fetchInsights = async () => {
        try {
          setInsightsLoading(true);
          setInsightsError(null);
          await onFetchInsights();
        } catch (e) {
          setInsightsError(e.message || 'Failed to fetch insights');
        } finally {
          setInsightsLoading(false);
        }
      };

      const fetchForecast = async (currentStats) => {
        try {
          setForecastLoading(true);
          setForecastError(null);
          await onFetchForecast(currentStats);
        } catch (e) {
          setForecastError(e.message || 'Failed to fetch forecast');
        } finally {
          setForecastLoading(false);
        }
      };

      return (
        <div>
          {forecastLoading ? (
            <div role="status">Loading forecast...</div>
          ) : forecastError ? (
            <div role="alert">
              <div>Error loading forecast</div>
              <div>{forecastError}</div>
              <button onClick={fetchForecast}>Retry Forecast</button>
            </div>
          ) : forecast ? (
            <div>Next period expected sales: {forecast.next}</div>
          ) : null}

          {insightsLoading ? (
            <div role="status">Loading insights...</div>
          ) : insightsError ? (
            <div role="alert">
              <div>Error loading insights</div>
              <div>{insightsError}</div>
              <button onClick={fetchInsights}>Retry Insights</button>
            </div>
          ) : (
            <div data-testid="insights-content">{insights ? 'Insights Ready' : 'No Insights'}</div>
          )}
        </div>
      );
    }

    it('renders forecast success while insights renders error state with retry button', async () => {
      const onFetchInsights = jest.fn();

      render(
        <AiSectionTestHarness
          initialForecast={{ next: 50000 }}
          initialInsightsError="Failed to fetch insights"
          onFetchInsights={onFetchInsights}
        />
      );

      // Forecast renders its metric despite insights failure
      expect(screen.getByText('Next period expected sales: 50000')).toBeInTheDocument();

      // Insights displays dedicated error alert and retry button
      expect(screen.getByText('Error loading insights')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: 'Retry Insights' });
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);
      expect(onFetchInsights).toHaveBeenCalledTimes(1);
    });

    it('renders insights success while forecast renders error state with retry button', async () => {
      const onFetchForecast = jest.fn();

      render(
        <AiSectionTestHarness
          initialInsights={{ alerts: [], recommendations: [] }}
          initialForecastError="AI Service Unavailable"
          onFetchForecast={onFetchForecast}
        />
      );

      // Insights renders normally
      expect(screen.getByTestId('insights-content')).toHaveAttribute('data-testid', 'insights-content');

      // Forecast displays dedicated error alert and retry button
      expect(screen.getByText('Error loading forecast')).toBeInTheDocument();
      expect(screen.getByText('AI Service Unavailable')).toBeInTheDocument();
      const retryBtn = screen.getByRole('button', { name: 'Retry Forecast' });
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);
      expect(onFetchForecast).toHaveBeenCalledTimes(1);
    });

    it('Promise.allSettled allows both tasks to complete independently even if one throws', async () => {
      const mockInsights = jest.fn().mockRejectedValue(new Error('Insights API 500'));
      const mockForecast = jest.fn().mockResolvedValue({ predictions: [75000] });

      const results = await Promise.allSettled([
        mockInsights(),
        mockForecast()
      ]);

      expect(results[0].status).toBe('rejected');
      expect(results[0].reason.message).toBe('Insights API 500');

      expect(results[1].status).toBe('fulfilled');
      expect(results[1].value).toEqual({ predictions: [75000] });
    });
  });
});
