import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StatsGrid from '../StatsGrid';
import analyticsService from '../../../services/analytics.service';

// Mock useCurrency hook
jest.mock('../../../hooks/useCurrency', () => ({
  __esModule: true,
  default: () => ({
    format: (val) => `KSh ${Number(val || 0).toLocaleString()}`,
  }),
}));

// Mock DateRangePicker since react-calendar is ESM
jest.mock('../../DateRangePicker', () => () => <div data-testid="date-range-picker" />);

// Mock recharts
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
    AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
    Area: () => <div data-testid="area" />,
    YAxis: () => <div data-testid="y-axis" />,
    Tooltip: () => <div data-testid="tooltip" />,
  };
});

jest.mock('../../../services/analytics.service');

describe('StatsGrid - Business Insights Carousel Integration', () => {
  const mockOrderStats = {
    totalRevenue: 50000,
    revenuePercentageChange: 12.5,
    totalOrders: 150,
    orderPercentageChange: 5.2,
    orderData: [{ date: '2026-10-18', revenue: 50000, orders: 150 }],
  };

  const mockVisitorStats = {
    totalVisitors: 1000,
    percentageChange: 8.0,
    visitorData: [{ date: '2026-10-18', visitors: 1000 }],
  };

  const mockInsights = {
    alerts: [
      {
        type: 'INVENTORY',
        severity: 'HIGH',
        message: 'Restock milk immediately.',
      },
      {
        type: 'sales_anomaly',
        severity: 'MEDIUM',
        title: 'Sales Spike',
        description: 'Unusual spike in afternoon beverage sales.',
      },
    ],
    recommendations: [
      {
        type: 'FINANCIAL',
        priority: 'LOW',
        message: 'Review utility subscription costs.',
      },
    ],
    trends: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    analyticsService.getOrderStats.mockResolvedValue(mockOrderStats);
    analyticsService.getVisitorStats.mockResolvedValue(mockVisitorStats);
  });

  test('renders StatsGrid with DashboardInsightsCarousel directly beneath Total Revenue', async () => {
    render(
      <MemoryRouter>
        <StatsGrid
          insights={mockInsights}
          insightsLoading={false}
          insightsError={null}
        />
      </MemoryRouter>
    );

    // Wait for stats to load
    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });

    // Check that secondary stats are intact in the right-side layout
    expect(screen.getByText('Total Orders')).toBeInTheDocument();
    expect(screen.getByText('Total Visitors')).toBeInTheDocument();
    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();

    // Check that carousel is rendered with the insights
    const carouselRegion = screen.getByRole('region', { name: /business insights/i });
    expect(carouselRegion).toBeInTheDocument();
    expect(screen.getByText('Restock milk immediately.')).toBeInTheDocument();
  });

  test('renders carousel loading skeleton when insightsLoading is true within StatsGrid', async () => {
    render(
      <MemoryRouter>
        <StatsGrid
          insights={null}
          insightsLoading={true}
          insightsError={null}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('status', { name: /loading insights/i })
    ).toBeInTheDocument();
  });

  test('renders error state when insightsError is provided to StatsGrid', async () => {
    const onRetryMock = jest.fn();
    render(
      <MemoryRouter>
        <StatsGrid
          insights={null}
          insightsLoading={false}
          insightsError="Failed to load insights"
          onRetryInsights={onRetryMock}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load insights')).toBeInTheDocument();
  });
});
