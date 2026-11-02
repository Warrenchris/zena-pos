import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { reportsAPI } from '../services/api';
import useCurrency from '../hooks/useCurrency';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { fetchCategories } from '../store/slices/categoriesSlice';
import { employeesAPI } from '../services/api';
import aiAPI from '../services/ai.service';
import analyticsService from '../services/analytics.service';
import DateRangePicker from '../components/DateRangePicker';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import {
  SparklesIcon,
  ChartBarIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

const MODERN_CHART_COLORS = [
  '#784421',
  '#D97706',
  '#10B981',
  '#0EA5E9',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#6366F1'
];

const chartTooltipProps = {
  contentStyle: {
    backgroundColor: 'var(--bg-surface)',
    borderColor: 'var(--border-default)',
    color: 'var(--text-primary)',
    borderRadius: '12px',
    boxShadow: 'var(--shadow-md)',
  },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)', fontWeight: 600 },
};

export default function Reports() {
  const { format: formatCurrency } = useCurrency();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { categories = [] } = useSelector((state) => state.categories || { categories: [] });
  const [tab, setTab] = useState('sales');
  const [range, setRange] = useState('monthly');
  const [quick, setQuick] = useState('month'); // today | week | month | year | custom
  const [isWithin24Hours, setIsWithin24Hours] = useState(false);

  const formatLocalDate = (d) => {
    if (!d) return '';
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Set default start date to first day of current month (local time)
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(1); // First day of current month
    return formatLocalDate(date);
  });
  // Set default end date to today (local time)
  const [endDate, setEndDate] = useState(() => {
    return formatLocalDate(new Date());
  });
  const [cashierId, setCashierId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cashiers, setCashiers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [kpis, setKpis] = useState({ revenue: 0, sales: 0, activeCustomers: 0, topProduct: '-', grossProfit: 0, taxPayable: 0 });
  const [charts, setCharts] = useState({
    salesTrend: [],
    paymentBreakdown: [],
    topEmployees: [],
    productPerformance: [],
    customerSegments: [],
  });
  const [revVsExp, setRevVsExp] = useState([]);
  const [insights, setInsights] = useState('');
  const cacheRef = useRef(new Map());
  const debounceRef = useRef(null);

  // Load data when component mounts
  useEffect(() => {
    load();
  }, []);

  // Update date range when range type changes
  useEffect(() => {
    const now = new Date();
    if (quick === 'today') {
      const today = formatLocalDate(now);
      setStartDate(today);
      setEndDate(today);
      setRange('hourly');
      setIsWithin24Hours(true);
    } else if (quick === 'week') {
      const day = now.getDay() || 7;
      const start = new Date(now);
      start.setDate(now.getDate() - day + 1);
      setStartDate(formatLocalDate(start));
      setEndDate(formatLocalDate(now));
      setRange('daily');
      setIsWithin24Hours(false);
    } else if (quick === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatLocalDate(firstDay));
      setEndDate(formatLocalDate(now));
      setRange('daily');
      setIsWithin24Hours(false);
    } else if (quick === 'year') {
      const firstDay = new Date(now.getFullYear(), 0, 1);
      const lastDay = new Date(now.getFullYear(), 11, 31);
      setStartDate(formatLocalDate(firstDay));
      setEndDate(formatLocalDate(lastDay));
      setRange('monthly');
      setIsWithin24Hours(false);
    }
  }, [quick]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check if dates are within 24 hours
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffHours = (end - start) / (1000 * 60 * 60);
      const useHourly = diffHours <= 24;
      
      const baseParams = {
        range: useHourly ? 'hourly' : range,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        shopId: user?.shopId || user?.shop?.id,
        employeeId: cashierId || undefined,
        categoryId: categoryId || undefined,
      };

      const cacheKey = JSON.stringify({ tab, ...baseParams });
      if (cacheRef.current.has(cacheKey)) {
        const cached = cacheRef.current.get(cacheKey);
        setData(cached.data);
        if (tab === 'sales') {
          const k = cached.data?.kpis || {};
          setKpis({ 
            revenue: Number(k.totalRevenue || 0),
            sales: Number(k.totalSales || 0),
            activeCustomers: Number(k.activeCustomers || 0),
            topProduct: k.topProduct || '-',
            grossProfit: Number(k.grossProfit || 0),
            taxPayable: Number(k.taxPayable || 0)
          });
          setCharts({
            salesTrend: cached.data?.salesTrend || [],
            paymentBreakdown: cached.data?.paymentBreakdown || [],
            topEmployees: cached.data?.topEmployees || [],
            productPerformance: cached.data?.productPerformance || [],
            customerSegments: cached.data?.customerSegments || [],
          });
        }
        return;
      }

      if (tab === 'sales' || tab === 'insights') {
        const res = await reportsAPI.salesSummary(baseParams);
        setData(res.data);
        const k = res.data?.kpis || {};
        setKpis({
          revenue: Number(k.totalRevenue || 0),
          sales: Number(k.totalSales || 0),
          activeCustomers: Number(k.activeCustomers || 0),
          topProduct: k.topProduct || '-',
          grossProfit: 0,
          taxPayable: 0
        });

        const [channels, topProducts, employees, pl] = await Promise.all([
          analyticsService.getSalesChannels(range === 'monthly' ? 'month' : 'week').catch(() => null),
          analyticsService.getTopProducts(range === 'monthly' ? 'month' : 'week', 5).catch(() => null),
          reportsAPI.employeeSales(baseParams).then(r=>({ data: r.data })).catch(()=>({ data: [] })),
          reportsAPI.profitAndLoss(baseParams).catch(()=>({ data: null }))
        ]);

        const paymentBreakdown = (Array.isArray(res.data?.paymentBreakdown) && res.data.paymentBreakdown.length > 0)
          ? res.data.paymentBreakdown
          : (Array.isArray(channels?.platforms)
              ? channels.platforms.map(p => ({ method: p.name, value: Number(p.orders || p.revenue || 0) }))
              : []);

        const topEmployees = (Array.isArray(res.data?.topEmployees) && res.data.topEmployees.length > 0)
          ? res.data.topEmployees
          : (Array.isArray(employees?.data)
              ? employees.data.map(e => ({ name: e.performerName || e.user?.name || e.user?.email || 'Employee', revenue: Number(e.totalRevenue || e.revenue || 0) }))
              : []);

        const productPerformance = (Array.isArray(res.data?.productPerformance) && res.data.productPerformance.length > 0)
          ? res.data.productPerformance
          : (Array.isArray(topProducts?.products)
              ? topProducts.products.map(p => ({ product: p.name || p.productName || 'Product', sold: Number(p.quantity || p.sales || 0), revenue: Number(p.revenue || 0) }))
              : []);

        const customerSegments = res.data?.customerSegments || [];

        setCharts({
          salesTrend: res.data?.salesTrend || [],
          paymentBreakdown,
          topEmployees,
          productPerformance,
          customerSegments,
        });

        const topProductName = productPerformance?.[0]?.product || k.topProduct || '-';
        const grossProfit = pl?.data ? (pl.data.grossProfit !== undefined ? Number(pl.data.grossProfit) : Number(pl.data.netRevenue || 0) - Number(pl.data.totalExpenses || 0)) : undefined;
        const taxPayable = pl?.data ? Number(pl.data.totalTax || 0) : undefined;
        
        if (!res.data.kpis) res.data.kpis = {};
        res.data.kpis.topProduct = topProductName;
        if (grossProfit !== undefined) res.data.kpis.grossProfit = grossProfit;
        if (taxPayable !== undefined) res.data.kpis.taxPayable = taxPayable;

        setKpis(prev => ({
          ...prev,
          topProduct: topProductName,
          ...(Number.isFinite(grossProfit) ? { grossProfit: grossProfit } : {}),
          ...(Number.isFinite(taxPayable) ? { taxPayable: taxPayable } : {}),
        }));

        const rve = Array.isArray(res.data?.revVsExp) ? res.data?.revVsExp :
          (Array.isArray(res.data?.salesTrend) ? res.data.salesTrend.map(r => ({ period: r.period, revenue: r.revenue || 0, expenses: Math.max(0, (r.revenue||0) * 0.6) })) : []);
        setRevVsExp(rve);
        cacheRef.current.set(cacheKey, { data: res.data, ts: Date.now() });
      } else if (tab === 'pl') {
        const res = await reportsAPI.profitAndLoss(baseParams);
        setData(res.data);
        cacheRef.current.set(cacheKey, { data: res.data, ts: Date.now() });
      } else if (tab === 'tax') {
        const res = await reportsAPI.taxEstimate(baseParams);
        setData(res.data);
        cacheRef.current.set(cacheKey, { data: res.data, ts: Date.now() });
      }
      if (cacheRef.current.size > 8) {
        const oldestKey = [...cacheRef.current.entries()].sort((a,b)=>a[1].ts-b[1].ts)[0]?.[0];
        if (oldestKey) cacheRef.current.delete(oldestKey);
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    dispatch(fetchCategories());
    (async () => {
      try {
        const res = await employeesAPI.getAll();
        const rows = Array.isArray(res.data) ? res.data : [];
        setCashiers(rows);
      } catch {}
    })();
  }, [dispatch]);

  // Generate Quick Insights via AI (best-effort)
  useEffect(() => {
    if (tab !== 'insights') return;
    const trend = charts.salesTrend || [];
    if (!trend.length) return;
    (async () => {
      try {
        const payload = {
          series: trend.slice(-12).map(r => ({ period: r.period, revenue: Number(r.revenue||0), sales: Number(r.sales||0) })),
        };
        const res = await aiAPI.analyzeBusiness(payload);
        const text = res?.data?.summary || '';
        setInsights(text);
      } catch (e) {
        const last = trend[trend.length-1] || {};
        const prev = trend[trend.length-2] || {};
        const growth = prev.revenue ? (((last.revenue||0) - (prev.revenue||0)) / prev.revenue) * 100 : 0;
        const payTop = (charts.paymentBreakdown||[]).slice().sort((a,b)=>b.value-a.value)[0];
        const payText = payTop ? `${payTop.method} accounts for ${(payTop.value||0).toFixed(0)} units` : 'Payment mix stable';
        setInsights(`Revenue ${growth>=0?'grew':'declined'} ${Math.abs(growth).toFixed(1)}% vs prior period. ${payText}.`);
      }
    })();
  }, [tab, charts.salesTrend, charts.paymentBreakdown]);

  // Ensure at least two points so lines render even with a single data point
  const ensureTwoPoints = (rows, _, periodKey = 'period') => {
    const dataRows = Array.isArray(rows) ? rows.slice() : [];
    if (dataRows.length >= 2) return dataRows;
    if (dataRows.length === 1) {
      const only = dataRows[0];
      const label = only?.[periodKey];
      let prevLabel = 'prev';
      if (typeof label === 'string') {
        if (isWithin24Hours) {
          if (/^\d{2}:\d{2}$/.test(label)) {
            const h = parseInt(label.split(':')[0], 10);
            const ph = (h + 23) % 24;
            prevLabel = `${String(ph).padStart(2, '0')}:00`;
          } else {
            const date = new Date(label);
            if (!isNaN(date)) {
              date.setHours(date.getHours() - 1);
              prevLabel = `${String(date.getHours()).padStart(2, '0')}:00`;
            } else {
              prevLabel = `${label} (prev)`;
            }
          }
        } else {
          const m = label.match(/^(\d{4})-(\d{1,2})/);
          if (m) {
            const y = Number(m[1]);
            const mo = Number(m[2]);
            const d = new Date(y, mo - 2, 1);
            const pm = String(d.getMonth() + 1).padStart(2, '0');
            prevLabel = `${d.getFullYear()}-${pm}`;
          } else {
            prevLabel = `${label} (prev)`;
          }
        }
      }
      const clone = { ...only, [periodKey]: prevLabel };
      return [clone, only];
    }
    return dataRows;
  };

  const ensurePointsMemoized = useCallback(ensureTwoPoints, [isWithin24Hours]);
  
  const salesTrendData = useMemo(() => 
    ensurePointsMemoized(charts.salesTrend, ['revenue','sales']), 
    [charts.salesTrend, ensurePointsMemoized]
  );
  
  const revVsExpData = useMemo(() => 
    ensurePointsMemoized(revVsExp, ['revenue','expenses']), 
    [revVsExp, ensurePointsMemoized]
  );

  // Check if dates are within 24 hours whenever they change
  useEffect(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffHours = (end - start) / (1000 * 60 * 60);
    setIsWithin24Hours(diffHours <= 24);
    if (diffHours <= 24 && range !== 'hourly') {
      setRange('hourly');
    }
  }, [startDate, endDate, range]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load();
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range, startDate, endDate, cashierId, categoryId]);

  const exportCsv = () => {
    let rows = [];
    if (tab === 'sales') {
      rows = [['Period', 'Sales', 'Revenue', 'Tax', 'Discount'], ...(Array.isArray(data) ? data : []).map(r => [r.period, r.saleCount, r.revenue, r.tax, r.discount])];
    } else if (tab === 'pl' && data) {
      rows = [
        ['Gross Revenue', 'Tax', 'Discount', 'Refunds', 'Net Revenue', 'COGS', 'Gross Profit', 'Operating Expenses', 'Net Profit'],
        [data.grossRevenue || 0, data.totalTax || 0, data.totalDiscount || 0, data.totalRefunds || 0, data.revenue ?? data.netRevenue ?? 0, data.cogs || 0, data.grossProfit ?? ((data.revenue ?? data.netRevenue ?? 0) - (data.cogs || 0)), data.operatingExpenses ?? data.totalExpenses ?? 0, data.profit || 0]
      ];
    } else if (tab === 'tax' && data) {
      rows = [['Taxable Revenue','Rate','Estimated Tax'], [data.taxableRevenue, data.taxRate, data.estimatedTax]];
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    window.print();
  };

  const exportExcel = async () => {
    try {
      const xlsx = await import('xlsx');
      const wb = xlsx.utils.book_new();
      if (tab === 'sales' && Array.isArray(charts.salesTrend)) {
        const aoa = [['Period','Sales','Revenue']].concat((charts.salesTrend||[]).map(r=>[r.period,r.sales||0,r.revenue||0]));
        const ws = xlsx.utils.aoa_to_sheet(aoa);
        xlsx.utils.book_append_sheet(wb, ws, 'SalesTrend');
      } else if (tab === 'pl' && data) {
        const aoa = [
          ['Metric', 'Amount'],
          ['Gross Revenue (Pre-Discount)', data.grossRevenue || 0],
          ['Total Tax', data.totalTax || 0],
          ['Discounts', data.totalDiscount || 0],
          ['Refunds', data.totalRefunds || 0],
          ['Net Revenue (after discounts & refunds)', data.revenue ?? data.netRevenue ?? 0],
          ['Cost of Goods Sold (COGS)', data.cogs || 0],
          ['Gross Profit', data.grossProfit ?? ((data.revenue ?? data.netRevenue ?? 0) - (data.cogs || 0))],
          ['Operating Expenses', data.operatingExpenses ?? data.totalExpenses ?? 0],
          ['Net Profit', data.profit || 0]
        ];
        const ws = xlsx.utils.aoa_to_sheet(aoa);
        xlsx.utils.book_append_sheet(wb, ws, 'ProfitAndLoss');
      }
      const wbout = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tab}-report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      exportCsv();
    }
  };

  const handleRefresh = () => {
    const cacheKeys = Array.from(cacheRef.current.keys());
    cacheKeys.forEach(key => {
      if (key.includes(`"tab":"${tab}"`)) {
        cacheRef.current.delete(key);
      }
    });
    load();
  };

  const exportPdf = async () => {
    try {
      const jsPDFmod = await import('jspdf');
      const jsPDF = jsPDFmod.jsPDF || jsPDFmod.default?.jsPDF || jsPDFmod.default;
      const doc = new jsPDF('p','pt','a4');
      doc.setFontSize(14);
      doc.text(`Zana Reports - ${tab.toUpperCase()}`, 40, 40);
      let y = 70;
      if (tab === 'sales' && Array.isArray(charts.salesTrend)) {
        doc.setFontSize(10);
        doc.text('Sales Trend (first 20 rows)', 40, y);
        y += 16;
        const rows = (charts.salesTrend || []).slice(0, 20);
        rows.forEach(r => {
          doc.text(`${r.period || ''}: ${r.revenue || 0}`, 40, y);
          y += 14;
        });
      } else if (tab === 'pl' && data) {
        doc.setFontSize(10);
        doc.text('Profit & Loss Summary', 40, y);
        y += 18;
        const items = [
          ['Gross Revenue (Pre-Discount)', formatCurrency(data.grossRevenue || 0)],
          ['Total Tax', formatCurrency(data.totalTax || 0)],
          ['Discounts', formatCurrency(data.totalDiscount || 0)],
          ['Refunds', formatCurrency(data.totalRefunds || 0)],
          ['Net Revenue (after discounts & refunds)', formatCurrency(data.revenue ?? data.netRevenue ?? 0)],
          ['Cost of Goods Sold (COGS)', formatCurrency(data.cogs || 0)],
          ['Gross Profit', formatCurrency(data.grossProfit ?? ((data.revenue ?? data.netRevenue ?? 0) - (data.cogs || 0)))],
          ['Operating Expenses', formatCurrency(data.operatingExpenses ?? data.totalExpenses ?? 0)],
          ['Net Profit', formatCurrency(data.profit || 0)]
        ];
        items.forEach(([label, val]) => {
          doc.text(`${label}: ${val}`, 40, y);
          y += 16;
        });
      }
      doc.save(`${tab}-report.pdf`);
    } catch {
      window.print();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Comprehensive sales summaries, profit & loss statements, tax reports, and AI business insights."
      />

      {/* Sticky Filter Toolbar */}
      <Card variant="default" className="p-4 sticky top-0 z-40 backdrop-blur-md bg-surface/95 !overflow-visible border border-border-default shadow-floating">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-1.5 bg-surface-2/70 p-1 rounded-xl border border-border-default">
            <TabButton active={tab === 'sales'} onClick={() => setTab('sales')}>Sales Summary</TabButton>
            <TabButton active={tab === 'pl'} onClick={() => setTab('pl')}>Profit & Loss</TabButton>
            <TabButton active={tab === 'tax'} onClick={() => setTab('tax')}>Tax Reports</TabButton>
            <TabButton active={tab === 'insights'} onClick={() => setTab('insights')}>Trends & Insights</TabButton>
          </div>

          <div className="flex items-center gap-1.5 bg-surface-2/70 p-1 rounded-xl border border-border-default">
            <QuickFilter label="Today" value="today" current={quick} setCurrent={setQuick} />
            <QuickFilter label="This Week" value="week" current={quick} setCurrent={setQuick} />
            <QuickFilter label="Month" value="month" current={quick} setCurrent={setQuick} />
            <QuickFilter label="Year" value="year" current={quick} setCurrent={setQuick} />
            <QuickFilter label="Custom" value="custom" current={quick} setCurrent={setQuick} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker 
              startDate={startDate} 
              endDate={endDate} 
              onChange={([start, end]) => {
                if (start) {
                  setStartDate(formatLocalDate(start));
                  setEndDate(formatLocalDate(end || start));
                  setQuick('custom');
                }
              }}
            />
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="h-10 rounded-xl border border-border-default px-3 bg-surface text-text-primary text-small focus:ring-2 focus:ring-primary/30 cursor-pointer"
              aria-label="Filter by employee"
            >
              <option value="">All Employees</option>
              {cashiers.map(c => (
                <option key={c.id} value={c.id} className="bg-surface text-text-primary">
                  {`${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || c.id}
                </option>
              ))}
            </select>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-10 rounded-xl border border-border-default px-3 bg-surface text-text-primary text-small focus:ring-2 focus:ring-primary/30 cursor-pointer"
              aria-label="Filter by category"
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id} className="bg-surface text-text-primary">
                  {cat.name}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={load}>Apply</Button>
            <Button variant="primary" size="sm" onClick={handleRefresh}>Refresh</Button>
            <div className="w-px h-6 bg-border-default mx-1" />
            <IconButton title="Export CSV" onClick={exportCsv} icon="csv" />
            <IconButton title="Export Excel" onClick={exportExcel} icon="excel" />
            <IconButton title="Export PDF" onClick={exportPdf} icon="pdf" />
            <IconButton title="Print" onClick={printReport} icon="print" />
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      {tab === 'sales' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard icon="revenue" label="Total Revenue" value={formatCurrency(kpis.revenue)} color="#3b82f6">
            <MiniSpark dataKey="revenue" data={(charts.salesTrend||[]).slice(-16)} color="#3b82f6" />
          </KpiCard>
          <KpiCard icon="sales" label="Total Sales" value={kpis.sales} color="#10b981">
            <MiniSpark dataKey="sales" data={(charts.salesTrend||[]).slice(-16)} color="#10b981" />
          </KpiCard>
          <KpiCard icon="customers" label="Active Customers" value={kpis.activeCustomers} color="#f59e0b">
            <MiniSpark dataKey="sales" data={(charts.salesTrend||[]).slice(-16)} color="#f59e0b" />
          </KpiCard>
          <KpiCard icon="product" label="Top Product" value={kpis.topProduct} color="var(--color-primary)" />
          <KpiCard icon="gross" label="Gross Profit" value={formatCurrency(kpis.grossProfit || 0)} color="#0ea5e9" />
          <KpiCard icon="tax" label="Tax Payable" value={formatCurrency(kpis.taxPayable || 0)} color="#ef4444" />
        </div>
      )}

      {/* Main Tab Content */}
      <div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-pulse">
            <Card loading />
            <Card loading />
            <Card loading />
            <Card loading />
          </div>
        ) : error ? (
          <Card variant="default" className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mx-auto mb-3">
              <ExclamationCircleIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="font-semibold text-text-primary text-h4 mb-1">Failed to load reports</p>
            <p className="text-small text-text-secondary mb-4">{error}</p>
            <Button variant="primary" size="sm" onClick={load}>Try Again</Button>
          </Card>
        ) : (
          <div>
            {tab === 'sales' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Sales Trend">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={salesTrendData} margin={{ top: 10, right: 24, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.6} />
                        <XAxis 
                          dataKey="period" 
                          stroke="var(--border-default)"
                          tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} 
                          tickLine={false}
                          tickFormatter={(value) => {
                            if (isWithin24Hours) {
                              if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) return value;
                              const date = new Date(value);
                              if (!isNaN(date)) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                              return String(value);
                            }
                            return value;
                          }}
                        />
                        <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                        <Tooltip 
                          {...chartTooltipProps}
                          labelFormatter={(value) => {
                            if (isWithin24Hours) {
                              if (typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)) return value;
                              const date = new Date(value);
                              if (!isNaN(date)) return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                              return String(value);
                            }
                            return value;
                          }}
                          formatter={(v, n)=>[n==='revenue'?formatCurrency(v):v, n === 'revenue' ? 'Revenue' : 'Sales']}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} formatter={(v) => <span className="text-text-secondary capitalize">{v}</span>} />
                        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} />
                        <Line type="monotone" dataKey="sales" name="Sales" stroke="#10b981" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#10b981' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#10b981' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Payment Method Distribution">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {(!charts.paymentBreakdown || charts.paymentBreakdown.length === 0) ? (
                        <EmptyChartState message="No payment data available" />
                      ) : (
                        <PieChart>
                          <Tooltip {...chartTooltipProps} />
                          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} formatter={(v) => <span className="text-text-secondary capitalize">{v}</span>} />
                          <Pie
                            data={charts.paymentBreakdown}
                            dataKey="value"
                            nameKey="method"
                            innerRadius={60}
                            outerRadius={95}
                            stroke="var(--bg-surface)"
                            strokeWidth={2}
                          >
                            {charts.paymentBreakdown.map((_, idx) => (
                              <Cell key={idx} fill={MODERN_CHART_COLORS[idx % MODERN_CHART_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Top Employees by Sales">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {(charts.topEmployees && charts.topEmployees.length > 0) ? (
                        <BarChart data={charts.topEmployees} margin={{ top: 10, right: 24, left: 8, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.6} />
                          <XAxis dataKey="name" stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} />
                          <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                          <Tooltip {...chartTooltipProps} formatter={(v)=>[formatCurrency(v), 'Revenue']} />
                          <Bar dataKey="revenue" fill="var(--color-primary)" radius={[6,6,0,0]} />
                        </BarChart>
                      ) : (
                        <EmptyChartState message="No employee sales records" />
                      )}
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Product Performance (Top vs Least)">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {(charts.productPerformance && charts.productPerformance.length > 0) ? (
                        <BarChart data={charts.productPerformance} margin={{ top: 10, right: 24, left: 8, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.6} />
                          <XAxis dataKey="product" stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} />
                          <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} />
                          <Tooltip {...chartTooltipProps} />
                          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} formatter={(v) => <span className="text-text-secondary capitalize">{v}</span>} />
                          <Bar dataKey="sold" name="Sold" fill="#10b981" radius={[6,6,0,0]} />
                          <Bar dataKey="revenue" name="Revenue" fill="var(--color-primary)" radius={[6,6,0,0]} />
                        </BarChart>
                      ) : (
                        <EmptyChartState message="No product performance records" />
                      )}
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Customer Segments">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {(!charts.customerSegments || charts.customerSegments.length === 0) ? (
                        <EmptyChartState message="No customer segments recorded" />
                      ) : (
                        <PieChart>
                          <Tooltip {...chartTooltipProps} />
                          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} formatter={(v) => <span className="text-text-secondary capitalize">{v}</span>} />
                          <Pie
                            data={charts.customerSegments}
                            dataKey="value"
                            nameKey="segment"
                            innerRadius={50}
                            outerRadius={90}
                            stroke="var(--bg-surface)"
                            strokeWidth={2}
                          >
                            {charts.customerSegments.map((_, idx) => (
                              <Cell key={idx} fill={MODERN_CHART_COLORS[idx % MODERN_CHART_COLORS.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Monthly Revenue vs Expenses">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revVsExpData} margin={{ top: 10, right: 24, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.6} />
                        <XAxis dataKey="period" stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} />
                        <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                        <Tooltip {...chartTooltipProps} formatter={(v,n)=>[formatCurrency(v), n === 'revenue' ? 'Revenue' : 'Expenses']} />
                        <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} formatter={(v) => <span className="text-text-secondary capitalize">{v}</span>} />
                        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} />
                        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#f59e0b' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#f59e0b' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            )}

            {tab === 'pl' && data && (
              <Card variant="default">
                <Card.Header
                  title="Profit & Loss Statement"
                  subtitle="Financial summary of revenue, cost of goods, operating expenses, and net profit"
                />
                <Card.Body className="space-y-6">
                  <div>
                    <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-3">Revenue & Adjustments</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <Stat label="Gross Revenue (Pre-discount)" value={data.grossRevenue} formatCurrency={formatCurrency} />
                      <Stat label="Total Tax (Sales Tax)" value={data.totalTax} formatCurrency={formatCurrency} />
                      <Stat label="Discounts" value={data.totalDiscount} formatCurrency={formatCurrency} />
                      <Stat label="Refunds" value={data.totalRefunds} formatCurrency={formatCurrency} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-3">Direct Costs & Margins</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Stat label="Net Revenue (after discounts & refunds)" value={data.revenue ?? data.netRevenue} formatCurrency={formatCurrency} />
                      <Stat label="COGS" value={data.cogs} formatCurrency={formatCurrency} />
                      <Stat label="Gross Profit" value={data.grossProfit ?? ((data.revenue ?? data.netRevenue) - (data.cogs || 0))} highlight formatCurrency={formatCurrency} />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-3">Operating Costs & Bottom Line</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Stat label="Operating Expenses" value={data.operatingExpenses ?? data.totalExpenses} formatCurrency={formatCurrency} />
                      <Stat label="Net Profit" value={data.profit} highlight formatCurrency={formatCurrency} />
                    </div>
                  </div>
                </Card.Body>
              </Card>
            )}

            {tab === 'tax' && data && (
              <Card variant="default">
                <Card.Header
                  title="Tax Summary & Estimates"
                  subtitle="Estimated tax liabilities based on taxable turnover and configured sales tax rates"
                />
                <Card.Body>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Stat label="Taxable Revenue" value={data.taxableRevenue} formatCurrency={formatCurrency} />
                    <Stat label="Tax Rate" value={`${(Number(data.taxRate || 0)*100).toFixed(2)}%`} />
                    <Stat label="Estimated Tax" value={data.estimatedTax} highlight formatCurrency={formatCurrency} />
                  </div>
                </Card.Body>
              </Card>
            )}

            {tab === 'insights' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <ChartCard title="Sales Trend">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={salesTrendData} margin={{ top: 10, right: 24, left: 8, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.6} />
                          <XAxis dataKey="period" stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} />
                          <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                          <Tooltip {...chartTooltipProps} formatter={(v,n)=>[n==='revenue'?formatCurrency(v):v, n === 'revenue' ? 'Revenue' : 'Sales']} />
                          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} formatter={(v) => <span className="text-text-secondary capitalize">{v}</span>} />
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} />
                          <Line type="monotone" dataKey="sales" name="Sales" stroke="#10b981" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#10b981' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#10b981' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>

                  <ChartCard title="Monthly Revenue vs Expenses">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={revVsExpData} margin={{ top: 10, right: 24, left: 8, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" opacity={0.6} />
                          <XAxis dataKey="period" stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} />
                          <YAxis stroke="var(--border-default)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                          <Tooltip {...chartTooltipProps} formatter={(v,n)=>[formatCurrency(v), n === 'revenue' ? 'Revenue' : 'Expenses']} />
                          <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }} formatter={(v) => <span className="text-text-secondary capitalize">{v}</span>} />
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#3b82f6' }} />
                          <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f59e0b" strokeWidth={2.5} connectNulls dot={{ r: 3, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#f59e0b' }} activeDot={{ r: 5, stroke: 'var(--bg-surface)', strokeWidth: 2, fill: '#f59e0b' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>
                </div>

                {/* AI Insights Card */}
                <div>
                  <Card variant="default">
                    <Card.Header
                      title="AI Business Insights"
                      subtitle="Automated analysis based on historical trends"
                    />
                    <Card.Body>
                      {insights ? (
                        <div className="space-y-4">
                          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-text-primary text-small leading-relaxed">
                            {insights}
                          </div>
                          <p className="text-caption text-text-muted">
                            Insights are automatically evaluated from revenue trajectory, transaction count, and payment channel distributions.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center p-8 text-text-muted">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                            <SparklesIcon className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <p className="text-small font-semibold text-text-primary">Generating insights...</p>
                          <p className="text-caption text-text-muted mt-1">Analyzing sales trajectory and transaction patterns.</p>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, formatCurrency: fmt }) {
  const isNegative = Number(value || 0) < 0;
  return (
    <div
      className={`p-4 rounded-xl border transition-colors ${
        highlight
          ? isNegative
            ? 'border-danger/30 bg-danger/10'
            : 'border-success/30 bg-success/10'
          : 'border-border-default bg-surface-2/50'
      }`}
    >
      <div className="text-caption font-semibold uppercase tracking-wider text-text-muted">{label}</div>
      <div
        className={`text-h3 font-bold mt-1 tracking-tight ${
          highlight
            ? isNegative
              ? 'text-danger'
              : 'text-success'
            : 'text-text-primary'
        }`}
      >
        {fmt ? fmt(Number(value || 0)) : (typeof value === 'string' ? value : Number(value || 0).toLocaleString())}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color, children }) {
  return (
    <Card variant="default" className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">{label}</span>
        <div className="p-2 rounded-xl bg-surface-2 shrink-0 border border-border-default/60">
          <KpiIcon type={icon} color={color || 'var(--color-primary)'} />
        </div>
      </div>
      <div className="text-h3 font-bold text-text-primary mt-2 tracking-tight">{value}</div>
      {children ? (
        <div className="mt-2 h-10">
          {children}
        </div>
      ) : null}
    </Card>
  );
}

function ChartCard({ title, children }) {
  return (
    <Card variant="default">
      <Card.Header title={title} />
      <Card.Body>
        {children}
      </Card.Body>
    </Card>
  );
}

function EmptyChartState({ message = 'No data available' }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6 text-text-secondary">
      <ChartBarIcon className="h-8 w-8 text-text-muted mb-2 stroke-1" aria-hidden="true" />
      <p className="font-semibold text-text-primary text-small">{message}</p>
      <p className="text-caption text-text-muted mt-0.5">No records found for the selected period.</p>
    </div>
  );
}

function MiniSpark({ data, dataKey, color }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <YAxis hide domain={['dataMin','dataMax']} />
        <XAxis hide dataKey="period" />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function KpiIcon({ type, color = 'var(--color-primary)' }) {
  const common = { width: 20, height: 20 };
  if (type === 'revenue') return (
    <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12l4 4 8-8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
  if (type === 'sales') return (
    <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h18M3 6h18M3 18h18" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>
  );
  if (type === 'customers') return (
    <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={color} strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke={color} strokeWidth="2"/></svg>
  );
  if (type === 'product') return (
    <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke={color} strokeWidth="2"/></svg>
  );
  if (type === 'gross') return (
    <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 3v18M7 7h8a4 4 0 010 8H7" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>
  );
  if (type === 'tax') return (
    <svg {...common} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7h18M6 10h12M9 13h6M12 16h0" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>
  );
  return null;
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-small font-semibold transition-all duration-150 ${
        active
          ? 'bg-primary text-white shadow-2xs'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

function QuickFilter({ label, value, current, setCurrent }) {
  const isActive = current === value;
  return (
    <button
      type="button"
      onClick={() => setCurrent(value)}
      className={`px-3 py-1 rounded-xl text-caption font-semibold transition-all duration-150 ${
        isActive
          ? 'bg-primary/15 text-primary border border-primary/30 font-bold'
          : 'text-text-muted hover:text-text-primary hover:bg-surface-2 border border-transparent'
      }`}
    >
      {label}
    </button>
  );
}

function IconButton({ title, onClick, icon }) {
  const icons = {
    csv: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4h10l6 6v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5"/><path d="M14 4v6h6" stroke="currentColor" strokeWidth="1.5"/><text x="8" y="17" fontSize="7" fill="currentColor">CSV</text></svg>
    ),
    excel: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 8l8 8M16 8l-8 8" stroke="#10b981" strokeWidth="1.5"/></svg>
    ),
    pdf: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/><text x="8" y="16" fontSize="7" fill="#ef4444">PDF</text></svg>
    ),
    print: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9V3h12v6M6 18v3h12v-3" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="9" width="18" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg>
    )
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="p-2 rounded-xl border border-border-default bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {icons[icon]}
    </button>
  );
}
