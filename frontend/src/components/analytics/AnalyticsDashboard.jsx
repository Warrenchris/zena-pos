import React, { useEffect, useMemo, useState } from 'react';
import AnalyticsHeader from './AnalyticsHeader';
import AnalyticsStats from './AnalyticsStats';
import AnalyticsRevenue from './AnalyticsRevenue';
import AnalyticsVisitors from './AnalyticsVisitors';
import AnalyticsOrders from './AnalyticsOrders';
import AnalyticsPlatforms from './AnalyticsPlatforms';
import AnalyticsLocations from './AnalyticsLocations';
import AnalyticsProducts from './AnalyticsProducts';
import analyticsService from '../../services/analytics.service';
import { expensesAPI } from '../../services/api';
import { invoicesAPI } from '../../services/api/invoices';
import useCurrency from '../../hooks/useCurrency';

const periodOptions = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const periodToApi = {
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

const getDateRange = (periodKey) => {
  const end = new Date();
  const start = new Date(end);

  switch (periodKey) {
    case 'yearly':
      start.setMonth(0, 1);
      break;
    case 'monthly':
      start.setDate(1);
      break;
    case 'weekly':
    default:
      start.setDate(end.getDate() - 6);
      break;
  }

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
};

const AnalyticsDashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('weekly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orderStats, setOrderStats] = useState(null);
  const [visitorStats, setVisitorStats] = useState(null);
  const [salesChannels, setSalesChannels] = useState(null);
  const [customerLocations, setCustomerLocations] = useState(null);
  const [topProducts, setTopProducts] = useState(null);
  const [invoiceStats, setInvoiceStats] = useState(null);
  const [expenseStats, setExpenseStats] = useState(null);
  const { format: formatCurrency } = useCurrency();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const apiPeriod = periodToApi[selectedPeriod] || 'week';
      const dateRange = getDateRange(selectedPeriod);

      try {
        const [orders, visitors, platforms, locations, products, invoiceResponse, expenseResponse] = await Promise.all([
          analyticsService.getOrderStats(apiPeriod),
          analyticsService.getVisitorStats(apiPeriod),
          analyticsService.getSalesChannels(apiPeriod),
          analyticsService.getCustomerLocations(apiPeriod),
          analyticsService.getTopProducts(apiPeriod, 8),
          invoicesAPI
            .getStatistics(dateRange)
            .then((res) => res?.data || res)
            .catch(() => ({})),
          expensesAPI
            .getStatistics(dateRange)
            .then((res) => res?.data || res)
            .catch(() => ({})),
        ]);

        if (!cancelled) {
          setOrderStats(orders);
          setVisitorStats(visitors);
          setSalesChannels(platforms);
          setCustomerLocations(locations);
          setTopProducts(products);
          setInvoiceStats(invoiceResponse);
          setExpenseStats(expenseResponse);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load analytics data', err);
          setError(err?.message || 'Failed to load analytics data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedPeriod]);

  const summary = useMemo(() => {
    const revenue = Number(orderStats?.totalRevenue || 0);
    const growth = Number(orderStats?.revenuePercentageChange || 0);

    let insight = 'Revenue performance is steady versus the previous period.';
    if (growth > 0) {
      insight = `Revenue increased by ${growth.toFixed(1)}% compared to the previous period.`;
    } else if (growth < 0) {
      insight = `Revenue decreased by ${Math.abs(growth).toFixed(1)}% compared to the previous period.`;
    }

    return {
      totalRevenue: formatCurrency(revenue),
      growth: `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`,
      insight,
    };
  }, [orderStats, formatCurrency]);

  return (
    <div className="rounded-[24px] border border-yellow-500/20 bg-gradient-to-br from-[#05060c] via-[#090d1c] to-[#020409] p-6 text-white shadow-[0_0_45px_rgba(250,204,21,0.08)] space-y-6 animate-fadeIn">
      <AnalyticsHeader />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeUp">
        <div className="lg:col-span-2 rounded-[20px] border border-yellow-500/30 bg-gradient-to-r from-[#10162d] via-[#101428] to-[#0b0f1f] p-6 shadow-[0_0_25px_rgba(250,204,21,0.12)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-yellow-200/70">
                Total Revenue ({summary.growth})
              </p>
              <h2 className="mt-2 text-4xl font-bold text-yellow-200">
                {summary.totalRevenue}
              </h2>
            </div>
            <div className="rounded-[16px] border border-yellow-400/20 bg-black/30 px-4 py-3 text-sm text-white/80 shadow-[0_0_18px_rgba(250,204,21,0.12)]">
              {summary.insight}
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-yellow-400/40 bg-black/50 p-6 shadow-[0_0_24px_rgba(250,204,21,0.18)]">
          <p className="text-sm uppercase tracking-[0.16em] text-yellow-100/70">
            Analytics Range
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {periodOptions.map((option) => {
              const isActive = selectedPeriod === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelectedPeriod(option.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'border-yellow-400 bg-yellow-400 text-black shadow-[0_0_20px_rgba(250,204,21,0.4)]'
                      : 'border-yellow-400/30 bg-black/40 text-yellow-200 hover:border-yellow-300 hover:text-yellow-100'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-[16px] border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <AnalyticsStats
        selectedPeriod={selectedPeriod}
        orderStats={orderStats}
        visitorStats={visitorStats}
        invoiceStats={invoiceStats}
        expenseStats={expenseStats}
        loading={loading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="transition-transform duration-300 hover:-translate-y-1">
          <AnalyticsRevenue
            selectedPeriod={selectedPeriod}
            orderStats={orderStats}
            loading={loading}
          />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-1">
          <AnalyticsVisitors
            selectedPeriod={selectedPeriod}
            visitorStats={visitorStats}
            loading={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="transition-transform duration-300 hover:-translate-y-1">
          <AnalyticsOrders
            selectedPeriod={selectedPeriod}
            orderStats={orderStats}
            loading={loading}
          />
        </div>
        <div className="transition-transform duration-300 hover:-translate-y-1">
          <AnalyticsPlatforms
            salesChannels={salesChannels}
            loading={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="transition-transform duration-300 hover:-translate-y-1">
          <AnalyticsLocations
            customerLocations={customerLocations}
            loading={loading}
          />
        </div>
        <div className="lg:col-span-2 transition-transform duration-300 hover:-translate-y-1">
          <AnalyticsProducts
            topProducts={topProducts}
            loading={loading}
            selectedPeriod={selectedPeriod}
          />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;