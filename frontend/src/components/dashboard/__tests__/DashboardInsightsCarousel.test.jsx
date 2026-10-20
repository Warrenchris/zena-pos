import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardInsightsCarousel, {
  normalizeInsights,
} from '../DashboardInsightsCarousel';
import api from '../../../services/api';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

describe('DashboardInsightsCarousel Component & Data Adapter', () => {
  const sampleInsights = {
    alerts: [
      {
        type: 'sales_anomaly',
        severity: 'HIGH',
        title: 'Unusual sales pattern detected on 2026-10-16',
        description:
          'Revenue was KSh 12,000 with 4 transactions — statistically unusual for this day of week.',
        recommendation: 'Review promotions or outages.',
      },
      {
        type: 'INVENTORY',
        severity: 'HIGH',
        message: 'Critical stock levels detected on 3 products.',
      },
    ],
    recommendations: [
      {
        type: 'FINANCIAL',
        priority: 'MEDIUM',
        message: 'High expenses detected in marketing category.',
      },
      {
        type: 'FORECAST',
        priority: 'HIGH',
        message: 'Stock depletion forecast: Bread may run out in 2 days.',
      },
    ],
    trends: [
      { date: '2026-10-15', totalSales: 15000 },
      { date: '2026-10-16', totalSales: 12000 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('1. Data Normalization (normalizeInsights)', () => {
    test('normalizes valid alerts and recommendations with stable keys, category, and severity', () => {
      const result = normalizeInsights(sampleInsights);
      expect(result).toHaveLength(4);

      expect(result[0]).toMatchObject({
        kind: 'alert',
        category: 'Anomaly',
        title: 'Unusual sales pattern detected on 2026-10-16',
        message:
          'Revenue was KSh 12,000 with 4 transactions — statistically unusual for this day of week.',
        severity: 'high',
      });
      expect(result[0].id).toBeDefined();

      expect(result[1]).toMatchObject({
        kind: 'alert',
        category: 'Inventory',
        title: 'Inventory Alert',
        message: 'Critical stock levels detected on 3 products.',
        severity: 'high',
      });

      expect(result[2]).toMatchObject({
        kind: 'recommendation',
        category: 'Financial',
        title: 'Expense Recommendation',
        message: 'High expenses detected in marketing category.',
        severity: 'medium',
      });

      expect(result[3]).toMatchObject({
        kind: 'recommendation',
        category: 'Forecast',
        title: 'Stock Depletion Forecast',
        message: 'Stock depletion forecast: Bread may run out in 2 days.',
        severity: 'high',
      });
    });

    test('safely handles missing, null, undefined, primitive, or malformed data', () => {
      expect(normalizeInsights(null)).toEqual([]);
      expect(normalizeInsights(undefined)).toEqual([]);
      expect(normalizeInsights('not an object')).toEqual([]);
      expect(normalizeInsights(12345)).toEqual([]);
      expect(normalizeInsights([])).toEqual([]);
      expect(normalizeInsights({})).toEqual([]);
      expect(
        normalizeInsights({
          alerts: 'not-array',
          recommendations: null,
          trends: undefined,
        })
      ).toEqual([]);
    });

    test('safely handles malformed alert and recommendation array entries', () => {
      const malformedData = {
        alerts: [
          null,
          undefined,
          123,
          'string',
          {},
          { type: 'UNKNOWN' }, // missing message and title
          {
            type: 'SALES',
            message: 'Database Error: SQLITE_BUSY occurred in worker', // technical error skipped
          },
          {
            type: 'SALES',
            severity: 'LOW',
            message: 'Sales volume increased steadily this week.',
          },
        ],
        recommendations: [
          null,
          {},
          { type: 'INVENTORY' }, // missing message
          {
            type: 'DECISION',
            priority: 'LOW',
            message: 'Consider adjusting price margin on slow-moving items.',
          },
        ],
      };

      const result = normalizeInsights(malformedData);
      expect(result).toHaveLength(2);
      expect(result[0].message).toBe(
        'Sales volume increased steadily this week.'
      );
      expect(result[0].severity).toBe('low');
      expect(result[1].message).toBe(
        'Consider adjusting price margin on slow-moving items.'
      );
    });

    test('deduplicates identical records', () => {
      const duplicateData = {
        alerts: [
          { type: 'INVENTORY', message: 'Restock milk soon.' },
          { type: 'INVENTORY', message: 'Restock milk soon.' },
        ],
        recommendations: [
          { type: 'INVENTORY', message: 'Restock milk soon.' },
        ],
      };
      const result = normalizeInsights(duplicateData);
      // First is an alert, subsequent duplicate messages under the same title are omitted
      expect(result.length).toBeLessThanOrEqual(2);
      const messages = result.map((r) => r.message);
      const uniqueMessages = Array.from(new Set(messages));
      expect(messages.length).toBe(uniqueMessages.length);
    });

    test('omits raw numeric trend points without interpreting them, but includes trends with textual messages', () => {
      const trendsData = {
        trends: [
          { date: '2026-10-15', totalSales: 15000 },
          {
            date: '2026-10-16',
            title: 'Weekend Sales Trend',
            message: 'Consistent weekend transaction surge.',
          },
        ],
      };
      const result = normalizeInsights(trendsData);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Weekend Sales Trend');
      expect(result[0].message).toBe('Consistent weekend transaction surge.');
    });
  });

  describe('2. UI States (Loading, Empty, Error)', () => {
    test('renders compact skeleton loading state when loading is true', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel loading={true} />
        </MemoryRouter>
      );
      const skeleton = screen.getByRole('status', {
        name: /loading insights/i,
      });
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass('animate-pulse');
    });

    test('renders error state with retry button and View All link when error is present', () => {
      const onRetryMock = jest.fn();
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel
            error="Connection timed out"
            onRetry={onRetryMock}
          />
        </MemoryRouter>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText(/unable to load insights/i)).toBeInTheDocument();
      expect(screen.getByText('Connection timed out')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);

      const viewAllBtn = screen.getByRole('button', { name: /view all/i });
      fireEvent.click(viewAllBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/ai/insights');
    });

    test('renders calm non-alarming empty state when there are no valid insights', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={{ alerts: [], recommendations: [] }} />
        </MemoryRouter>
      );

      expect(screen.getByText(/business insights/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /no active alerts or recommendations\. operations are running normally\./i
        )
      ).toBeInTheDocument();

      const viewAllBtn = screen.getByRole('button', { name: /view all/i });
      fireEvent.click(viewAllBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/ai/insights');
    });
  });

  describe('3. Carousel Navigation & Controls', () => {
    test('renders the first insight with accessible names, slide counter, and controls', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      const region = screen.getByRole('region', {
        name: /business insights/i,
      });
      expect(region).toBeInTheDocument();

      expect(
        screen.getByText('Unusual sales pattern detected on 2026-10-16')
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Revenue was KSh 12,000 with 4 transactions — statistically unusual for this day of week.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();

      expect(
        screen.getByRole('button', { name: /previous insight/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /next insight/i })
      ).toBeInTheDocument();
    });

    test('Previous and Next navigate correctly and wrap around', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      const nextBtn = screen.getByRole('button', { name: /next insight/i });
      const prevBtn = screen.getByRole('button', { name: /previous insight/i });

      // Initial slide: 1 of 4
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();
      expect(
        screen.getByText('Unusual sales pattern detected on 2026-10-16')
      ).toBeInTheDocument();

      // Click Next -> slide 2 of 4
      fireEvent.click(nextBtn);
      expect(screen.getByText(/2 of 4/i)).toBeInTheDocument();
      expect(
        screen.getByText('Critical stock levels detected on 3 products.')
      ).toBeInTheDocument();

      // Click Next -> slide 3 of 4
      fireEvent.click(nextBtn);
      expect(screen.getByText(/3 of 4/i)).toBeInTheDocument();

      // Click Next -> slide 4 of 4
      fireEvent.click(nextBtn);
      expect(screen.getByText(/4 of 4/i)).toBeInTheDocument();

      // Click Next at last slide -> wraps around to slide 1
      fireEvent.click(nextBtn);
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();
      expect(
        screen.getByText('Unusual sales pattern detected on 2026-10-16')
      ).toBeInTheDocument();

      // Click Prev at first slide -> wraps around to last slide (4 of 4)
      fireEvent.click(prevBtn);
      expect(screen.getByText(/4 of 4/i)).toBeInTheDocument();
      expect(
        screen.getByText('Stock depletion forecast: Bread may run out in 2 days.')
      ).toBeInTheDocument();
    });

    test('pagination tab button selects the requested insight slide', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      const slide3Tab = screen.getByRole('tab', {
        name: 'Go to slide 3 of 4',
      });
      fireEvent.click(slide3Tab);

      expect(screen.getByText(/3 of 4/i)).toBeInTheDocument();
      expect(
        screen.getByText('High expenses detected in marketing category.')
      ).toBeInTheDocument();
      expect(slide3Tab).toHaveAttribute('aria-selected', 'true');
    });

    test('View All button navigates to /ai/insights', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      const viewAllBtn = screen.getByRole('button', { name: /view all/i });
      fireEvent.click(viewAllBtn);
      expect(mockNavigate).toHaveBeenCalledWith('/ai/insights');
    });
  });

  describe('4. Automatic Rotation & Timer Lifecycle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    test('slide automatically advances after 30 seconds (30,000 ms)', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(29999);
      });
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(screen.getByText(/2 of 4/i)).toBeInTheDocument();
      expect(
        screen.getByText('Critical stock levels detected on 3 products.')
      ).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(30000);
      });
      expect(screen.getByText(/3 of 4/i)).toBeInTheDocument();
    });

    test('automatic rotation does not run with fewer than two insights', () => {
      const singleInsight = {
        alerts: [
          {
            type: 'INVENTORY',
            severity: 'HIGH',
            message: 'Single critical product.',
          },
        ],
        recommendations: [],
      };

      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={singleInsight} />
        </MemoryRouter>
      );

      expect(screen.getByText('Single critical product.')).toBeInTheDocument();
      expect(screen.getByText('Active insight')).toBeInTheDocument();
      // No prev/next controls with single insight
      expect(
        screen.queryByRole('button', { name: /previous insight/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /next insight/i })
      ).not.toBeInTheDocument();

      // Advance by 60 seconds -> remains on the single insight
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      expect(screen.getByText('Single critical product.')).toBeInTheDocument();
    });

    test('rotation pauses on pointer hover and resumes when pointer leaves', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      const region = screen.getByRole('region', {
        name: /business insights/i,
      });
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();

      // Hover over the carousel -> pauses rotation
      fireEvent.mouseEnter(region);

      act(() => {
        jest.advanceTimersByTime(45000);
      });
      // Should STILL be on slide 1 because it's paused!
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();

      // Pointer leaves -> resumes rotation
      fireEvent.mouseLeave(region);

      act(() => {
        jest.advanceTimersByTime(30000);
      });
      // Should now have advanced to slide 2
      expect(screen.getByText(/2 of 4/i)).toBeInTheDocument();
    });

    test('rotation pauses on keyboard focus and resumes on blur', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      const region = screen.getByRole('region', {
        name: /business insights/i,
      });
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();

      // Focus inside the carousel -> pauses rotation
      fireEvent.focus(region);

      act(() => {
        jest.advanceTimersByTime(60000);
      });
      expect(screen.getByText(/1 of 4/i)).toBeInTheDocument();

      // Blur away from the carousel -> resumes rotation
      fireEvent.blur(region, { relatedTarget: document.body });

      act(() => {
        jest.advanceTimersByTime(30000);
      });
      expect(screen.getByText(/2 of 4/i)).toBeInTheDocument();
    });

    test('timer cleanup occurs on unmount without leaking intervals or updates', () => {
      const clearIntervalSpy = jest.spyOn(window, 'clearInterval');
      const { unmount } = render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      expect(clearIntervalSpy).not.toHaveBeenCalled();
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    test('changing the insight list or shrinking length clamps/resets active index safely', () => {
      const { rerender } = render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      // Navigate to slide 4 (index 3)
      const slide4Tab = screen.getByRole('tab', { name: 'Go to slide 4 of 4' });
      fireEvent.click(slide4Tab);
      expect(screen.getByText(/4 of 4/i)).toBeInTheDocument();

      // Rerender with a list of only 2 insights
      const smallerInsights = {
        alerts: [sampleInsights.alerts[0]],
        recommendations: [sampleInsights.recommendations[0]],
      };
      rerender(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={smallerInsights} />
        </MemoryRouter>
      );

      // Index is safely reset/clamped to 0
      expect(screen.getByText(/1 of 2/i)).toBeInTheDocument();
      expect(
        screen.getByText('Unusual sales pattern detected on 2026-10-16')
      ).toBeInTheDocument();
    });

    test('no network or AI requests are triggered by carousel rotation or manual navigation', () => {
      render(
        <MemoryRouter>
          <DashboardInsightsCarousel insights={sampleInsights} />
        </MemoryRouter>
      );

      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();

      // Advance timers by 90 seconds (3 slides)
      act(() => {
        jest.advanceTimersByTime(90000);
      });
      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();

      // Manual clicks
      const nextBtn = screen.getByRole('button', { name: /next insight/i });
      fireEvent.click(nextBtn);
      const prevBtn = screen.getByRole('button', { name: /previous insight/i });
      fireEvent.click(prevBtn);

      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
