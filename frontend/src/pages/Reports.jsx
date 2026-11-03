import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { reportsAPI, employeesAPI, expensesAPI } from '../services/api';
import useCurrency from '../hooks/useCurrency';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { fetchCategories } from '../store/slices/categoriesSlice';
import aiAPI from '../services/ai.service';
import analyticsService from '../services/analytics.service';
import DateRangePicker from '../components/DateRangePicker';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { generatePDF } from '../utils/documentGenerator';
import { generateExcel } from '../utils/excelGenerator';
import { downloadCSV } from '../utils/csv';
import { resolveBusinessIdentity } from '../utils/businessIdentity';
import { PrintableDocumentContainer } from '../components/documents/PrintableDocumentContainer';
import { toast } from '../utils/toast';
import {
  SparklesIcon,
  ChartBarIcon,
  ExclamationCircleIcon,
  UserGroupIcon,
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
  const auth = useSelector((state) => state.auth);
  const settings = useSelector((state) => state.settings);
  const shop = useSelector((state) => state.shop?.currentShop || state.shop?.shop);
  const identity = useMemo(() => resolveBusinessIdentity({ auth: { ...auth, shop }, settings }), [auth, settings, shop]);
  const [exporting, setExporting] = useState(null);
  const user = auth?.user;
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
  const isInitialMount = useRef(true);
  const prevTabRef = useRef(tab);

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
        if (tab === 'sales' || tab === 'cashier') {
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
          grossProfit: Number(k.grossProfit || 0),
          taxPayable: Number(k.taxPayable || 0),
        });

        const [channels, topProducts, employees, pl, expStats] = await Promise.all([
          analyticsService.getSalesChannels(range === 'monthly' ? 'month' : 'week').catch(() => null),
          analyticsService.getTopProducts(range === 'monthly' ? 'month' : 'week', 5).catch(() => null),
          reportsAPI.employeeSales(baseParams).then(r=>({ data: r.data })).catch(()=>({ data: [] })),
          reportsAPI.profitAndLoss(baseParams).catch(()=>({ data: null })),
          typeof expensesAPI?.getStatistics === 'function'
            ? expensesAPI.getStatistics({
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                shopId: user?.shopId || user?.shop?.id,
              }).catch(() => null)
            : Promise.resolve(null),
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

        // Build real expense map from actual backend expense statistics
        const expMap = new Map();
        if (Array.isArray(expStats?.data?.monthlyTrend)) {
          expStats.data.monthlyTrend.forEach((m) => {
            const key = String(m.month || '').substring(0, 7);
            expMap.set(key, Number(m.total || 0));
          });
        }

        const rve = Array.isArray(res.data?.revVsExp) && res.data.revVsExp.length > 0
          ? res.data.revVsExp
          : (Array.isArray(res.data?.salesTrend)
              ? res.data.salesTrend.map(r => {
                  const pKey = String(r.period || '').substring(0, 7);
                  const periodExpense = expMap.get(pKey) || (pl?.data?.totalExpenses ? Number(pl.data.totalExpenses) / Math.max(1, res.data.salesTrend.length) : 0);
                  return {
                    period: r.period,
                    revenue: Number(r.revenue || 0),
                    expenses: Number(periodExpense || 0),
                  };
                })
              : []);
        setRevVsExp(rve);
        cacheRef.current.set(cacheKey, { data: res.data, ts: Date.now() });
      } else if (tab === 'cashier') {
        const [empRes, summaryRes] = await Promise.all([
          reportsAPI.employeeSales(baseParams),
          reportsAPI.salesSummary(baseParams),
        ]);
        const employeesList = Array.isArray(empRes.data) ? empRes.data : [];
        const summaryData = summaryRes.data || {};
        const cashierData = {
          employees: employeesList,
          summary: summaryData,
        };
        setData(cashierData);
        const k = summaryData.kpis || {};
        setKpis({
          revenue: Number(k.totalRevenue || 0),
          sales: Number(k.totalSales || 0),
          activeCustomers: Number(k.activeCustomers || 0),
          topProduct: k.topProduct || '-',
          grossProfit: Number(k.grossProfit || 0),
          taxPayable: Number(k.taxPayable || 0),
        });
        setCharts({
          salesTrend: summaryData.salesTrend || [],
          paymentBreakdown: summaryData.paymentBreakdown || [],
          topEmployees: employeesList.map(e => ({
            name: e.performerName || 'Cashier',
            revenue: Number(e.totalRevenue || 0),
          })),
          productPerformance: summaryData.productPerformance || [],
          customerSegments: summaryData.customerSegments || [],
        });
        cacheRef.current.set(cacheKey, { data: cashierData, ts: Date.now() });
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
      } catch (err) {
        // Fallback gracefully if cashiers list fails
      }
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
          if (/^\\d{2}:\\d{2}$/.test(label)) {
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
          const m = label.match(/^(\\d{4})-(\\d{1,2})/);
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
    const tabChanged = prevTabRef.current !== tab;
    prevTabRef.current = tab;

    if (isInitialMount.current || tabChanged) {
      isInitialMount.current = false;
      load();
    } else {
      debounceRef.current = setTimeout(() => {
        load();
      }, 450);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range, startDate, endDate, cashierId, categoryId]);

  const selectedCashierName = useMemo(() => {
    if (!cashierId) return '';
    const found = cashiers.find(c => String(c.id) === String(cashierId));
    return found ? `${found.firstName || ''} ${found.lastName || ''}`.trim() || found.email || String(found.id) : '';
  }, [cashierId, cashiers]);

  const exportCsv = () => {
    try {
      setExporting('csv');
      let csvRows = [];
      let filename = `${tab}-report-${startDate}-to-${endDate}.csv`;

      if (tab === 'sales') {
        const salesTrend = charts.salesTrend || [];
        if (salesTrend.length === 0) {
          toast.error('No sales data available to export');
          return;
        }
        csvRows = salesTrend.map(r => ({
          Period: r.period || '',
          'Sales Count': r.sales ?? r.saleCount ?? 0,
          Revenue: Number(r.revenue || 0).toFixed(2),
          Tax: Number(r.tax || 0).toFixed(2),
          Discount: Number(r.discount || 0).toFixed(2)
        }));
        const totalSales = salesTrend.reduce((acc, r) => acc + Number(r.sales ?? r.saleCount ?? 0), 0);
        const totalRevenue = salesTrend.reduce((acc, r) => acc + Number(r.revenue || 0), 0);
        const totalTax = salesTrend.reduce((acc, r) => acc + Number(r.tax || 0), 0);
        const totalDiscount = salesTrend.reduce((acc, r) => acc + Number(r.discount || 0), 0);
        csvRows.push({
          Period: 'TOTAL',
          'Sales Count': totalSales,
          Revenue: totalRevenue.toFixed(2),
          Tax: totalTax.toFixed(2),
          Discount: totalDiscount.toFixed(2)
        });
        filename = `sales-summary-${startDate}-to-${endDate}.csv`;
      } else if (tab === 'cashier') {
        const empRows = (data?.employees && Array.isArray(data.employees)) ? data.employees : (charts.topEmployees || []);
        if (empRows.length === 0) {
          toast.error('No cashier or staff sales records to export');
          return;
        }
        csvRows = empRows.map(e => ({
          'Cashier / Staff': e.performerName || e.name || 'Staff Member',
          Role: e.role || 'Cashier',
          'Orders Handled': Number(e.totalSales || e.sales || 0),
          'Revenue Collected': Number(e.totalRevenue || e.revenue || 0).toFixed(2),
          'Average Order Value': Number(e.averageSaleValue || (e.totalSales > 0 ? (e.totalRevenue / e.totalSales) : 0)).toFixed(2),
        }));
        const totalStaffSales = empRows.reduce((sum, e) => sum + Number(e.totalSales || e.sales || 0), 0);
        const totalStaffRevenue = empRows.reduce((sum, e) => sum + Number(e.totalRevenue || e.revenue || 0), 0);
        csvRows.push({
          'Cashier / Staff': 'TOTAL',
          Role: '',
          'Orders Handled': totalStaffSales,
          'Revenue Collected': totalStaffRevenue.toFixed(2),
          'Average Order Value': totalStaffSales > 0 ? (totalStaffRevenue / totalStaffSales).toFixed(2) : '0.00',
        });
        filename = `cashier-shift-report-${startDate}-to-${endDate}.csv`;
      } else if (tab === 'pl' && data) {
        csvRows = [
          { Section: 'Revenue & Adjustments', Metric: 'Gross Revenue (Pre-Discount)', Amount: Number(data.grossRevenue || 0).toFixed(2) },
          { Section: 'Revenue & Adjustments', Metric: 'Total Tax (Sales Tax)', Amount: Number(data.totalTax || 0).toFixed(2) },
          { Section: 'Revenue & Adjustments', Metric: 'Discounts', Amount: Number(data.totalDiscount || 0).toFixed(2) },
          { Section: 'Revenue & Adjustments', Metric: 'Refunds', Amount: Number(data.totalRefunds || 0).toFixed(2) },
          { Section: 'Direct Costs & Margins', Metric: 'Net Revenue (after discounts & refunds)', Amount: Number(data.revenue ?? data.netRevenue ?? 0).toFixed(2) },
          { Section: 'Direct Costs & Margins', Metric: 'Cost of Goods Sold (COGS)', Amount: Number(data.cogs || 0).toFixed(2) },
          { Section: 'Direct Costs & Margins', Metric: 'Gross Profit', Amount: Number(data.grossProfit ?? ((data.revenue ?? data.netRevenue ?? 0) - (data.cogs || 0))).toFixed(2) },
          { Section: 'Operating Costs & Bottom Line', Metric: 'Operating Expenses', Amount: Number(data.operatingExpenses ?? data.totalExpenses ?? 0).toFixed(2) },
          { Section: 'Operating Costs & Bottom Line', Metric: 'Net Profit / (Loss)', Amount: Number(data.profit || 0).toFixed(2) }
        ];
        filename = `profit-and-loss-${startDate}-to-${endDate}.csv`;
      } else if (tab === 'tax' && data) {
        const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
        csvRows = breakdown.length > 0
          ? breakdown.map(b => ({
              'Tax Category': b.name || b.category || '',
              'Rate (%)': Number(b.rate || 0).toFixed(2),
              'Taxable Turnover': Number(b.taxableAmount || 0).toFixed(2),
              'Tax Liability': Number(b.taxAmount || 0).toFixed(2)
            }))
          : [{
              'Tax Category': 'Standard Sales Tax (16%)',
              'Rate (%)': ((Number(data.taxRate || 0)) * 100).toFixed(2),
              'Taxable Turnover': Number(data.taxableRevenue || 0).toFixed(2),
              'Tax Liability': Number(data.estimatedTax || 0).toFixed(2)
            }];
        const totalTaxable = breakdown.length > 0
          ? breakdown.reduce((acc, b) => acc + Number(b.taxableAmount || 0), 0)
          : Number(data.taxableRevenue || 0);
        const totalTax = breakdown.length > 0
          ? breakdown.reduce((acc, b) => acc + Number(b.taxAmount || 0), 0)
          : Number(data.estimatedTax || 0);
        csvRows.push({
          'Tax Category': 'TOTAL',
          'Rate (%)': '-',
          'Taxable Turnover': totalTaxable.toFixed(2),
          'Tax Liability': totalTax.toFixed(2)
        });
        filename = `tax-report-${startDate}-to-${endDate}.csv`;
      } else if (tab === 'insights') {
        const trajectory = (revVsExp && revVsExp.length > 0) ? revVsExp : (charts.salesTrend || []);
        csvRows = trajectory.map(r => ({
          Period: r.period || '',
          Revenue: Number(r.revenue || 0).toFixed(2),
          Expenses: Number(r.expenses || 0).toFixed(2),
          'Net Margin': (Number(r.revenue || 0) - Number(r.expenses || 0)).toFixed(2)
        }));
        filename = `business-insights-${startDate}-to-${endDate}.csv`;
      }

      if (csvRows.length === 0) {
        toast.error('No report records to export');
        return;
      }

      downloadCSV(filename, csvRows);
      toast.success('Report exported to CSV successfully');
    } catch (err) {
      console.error('Failed to export CSV:', err);
      toast.error('Failed to export CSV. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const printReport = () => {
    window.print();
  };

  const exportExcel = async () => {
    try {
      setExporting('excel');
      if (tab === 'sales') {
        const salesTrend = charts.salesTrend || [];
        const salesRows = salesTrend.map(r => [
          r.period || '',
          Number(r.sales ?? r.saleCount ?? 0),
          Number(r.revenue || 0),
          Number(r.tax || 0),
          Number(r.discount || 0)
        ]);
        const totalSales = salesTrend.reduce((acc, r) => acc + Number(r.sales ?? r.saleCount ?? 0), 0);
        const totalRevenue = salesTrend.reduce((acc, r) => acc + Number(r.revenue || 0), 0);
        const totalTax = salesTrend.reduce((acc, r) => acc + Number(r.tax || 0), 0);
        const totalDiscount = salesTrend.reduce((acc, r) => acc + Number(r.discount || 0), 0);

        const sheets = [
          {
            sheetName: 'Sales Trend',
            title: 'SALES SUMMARY REPORT',
            subtitle: `Period: ${startDate} to ${endDate}${selectedCashierName ? ` | Cashier: ${selectedCashierName}` : ''}`,
            identity,
            meta: [
              { label: 'Total Revenue', value: formatCurrency(kpis.revenue) },
              { label: 'Total Sales', value: kpis.sales },
              { label: 'Active Customers', value: kpis.activeCustomers },
              { label: 'Top Product', value: kpis.topProduct }
            ],
            columns: [
              { header: 'Period', key: 'period', width: 16 },
              { header: 'Sales Count', key: 'sales', type: 'number', width: 14 },
              { header: 'Revenue', key: 'revenue', type: 'currency', width: 18 },
              { header: 'Tax', key: 'tax', type: 'currency', width: 16 },
              { header: 'Discount', key: 'discount', type: 'currency', width: 16 }
            ],
            rows: salesRows,
            summaryRow: ['TOTAL', totalSales, totalRevenue, totalTax, totalDiscount]
          }
        ];

        if (charts.paymentBreakdown && charts.paymentBreakdown.length > 0) {
          sheets.push({
            sheetName: 'Payment Methods',
            title: 'PAYMENT METHOD BREAKDOWN',
            subtitle: `Period: ${startDate} to ${endDate}`,
            identity,
            columns: [
              { header: 'Payment Method', key: 'method', width: 22 },
              { header: 'Amount / Orders', key: 'value', type: 'currency', width: 20 }
            ],
            rows: charts.paymentBreakdown.map(p => [p.method || '', Number(p.value || 0)])
          });
        }

        if (charts.topEmployees && charts.topEmployees.length > 0) {
          sheets.push({
            sheetName: 'Cashier Performance',
            title: 'CASHIER & STAFF PERFORMANCE',
            subtitle: `Period: ${startDate} to ${endDate}`,
            identity,
            columns: [
              { header: 'Staff Member', key: 'name', width: 24 },
              { header: 'Revenue Generated', key: 'revenue', type: 'currency', width: 20 }
            ],
            rows: charts.topEmployees.map(e => [e.name || '', Number(e.revenue || 0)])
          });
        }

        await generateExcel({
          fileName: `sales-summary-${startDate}-to-${endDate}.xlsx`,
          sheets
        });
      } else if (tab === 'cashier') {
        const empRows = (data?.employees && Array.isArray(data.employees)) ? data.employees : (charts.topEmployees || []);
        const cashierRows = empRows.map(e => [
          e.performerName || e.name || 'Staff Member',
          e.role || 'Cashier',
          Number(e.totalSales || e.sales || 0),
          Number(e.totalRevenue || e.revenue || 0),
          Number(e.averageSaleValue || (e.totalSales > 0 ? (e.totalRevenue / e.totalSales) : 0))
        ]);
        const totalOrders = empRows.reduce((sum, e) => sum + Number(e.totalSales || e.sales || 0), 0);
        const totalRev = empRows.reduce((sum, e) => sum + Number(e.totalRevenue || e.revenue || 0), 0);

        const sheets = [
          {
            sheetName: 'Shift Summary',
            title: 'CASHIER & SHIFT SALES REPORT',
            subtitle: `Period: ${startDate} to ${endDate}${selectedCashierName ? ` | Cashier: ${selectedCashierName}` : ''}`,
            identity,
            meta: [
              { label: 'Shift Gross Revenue', value: formatCurrency(kpis.revenue) },
              { label: 'Shift Orders', value: kpis.sales },
              { label: 'Active Staff', value: empRows.length },
              { label: 'Average Ticket', value: formatCurrency(kpis.sales > 0 ? kpis.revenue / kpis.sales : 0) }
            ],
            columns: [
              { header: 'Cashier / Staff Member', key: 'performer', width: 26 },
              { header: 'Role', key: 'role', width: 18 },
              { header: 'Orders Handled', key: 'orders', type: 'number', width: 16 },
              { header: 'Revenue Collected', key: 'revenue', type: 'currency', width: 20 },
              { header: 'Average Ticket Value', key: 'avgTicket', type: 'currency', width: 20 }
            ],
            rows: cashierRows,
            summaryRow: ['TOTAL', '', totalOrders, totalRev, totalOrders > 0 ? totalRev / totalOrders : 0]
          }
        ];

        if (charts.paymentBreakdown && charts.paymentBreakdown.length > 0) {
          sheets.push({
            sheetName: 'Tender Reconciliation',
            title: 'PAYMENT TENDER RECONCILIATION',
            subtitle: `Period: ${startDate} to ${endDate}`,
            identity,
            columns: [
              { header: 'Payment Method', key: 'method', width: 22 },
              { header: 'Orders / Collected Amount', key: 'value', type: 'currency', width: 22 }
            ],
            rows: charts.paymentBreakdown.map(p => [p.method || '', Number(p.value || 0)])
          });
        }

        await generateExcel({
          fileName: `cashier-shift-report-${startDate}-to-${endDate}.xlsx`,
          sheets
        });
      } else if (tab === 'pl' && data) {
        const plRows = [
          ['Revenue & Adjustments', 'Gross Revenue (Pre-Discount)', Number(data.grossRevenue || 0)],
          ['Revenue & Adjustments', 'Total Tax (Sales Tax)', Number(data.totalTax || 0)],
          ['Revenue & Adjustments', 'Discounts', Number(data.totalDiscount || 0)],
          ['Revenue & Adjustments', 'Refunds', Number(data.totalRefunds || 0)],
          ['Direct Costs & Margins', 'Net Revenue (after discounts & refunds)', Number(data.revenue ?? data.netRevenue ?? 0)],
          ['Direct Costs & Margins', 'Cost of Goods Sold (COGS)', Number(data.cogs || 0)],
          ['Direct Costs & Margins', 'Gross Profit', Number(data.grossProfit ?? ((data.revenue ?? data.netRevenue ?? 0) - (data.cogs || 0)))],
          ['Operating Costs & Bottom Line', 'Operating Expenses', Number(data.operatingExpenses ?? data.totalExpenses ?? 0)],
          ['Operating Costs & Bottom Line', 'Net Profit / (Loss)', Number(data.profit || 0)]
        ];
        await generateExcel({
          fileName: `profit-and-loss-${startDate}-to-${endDate}.xlsx`,
          sheetName: 'ProfitAndLoss',
          title: 'PROFIT & LOSS STATEMENT',
          subtitle: `Period: ${startDate} to ${endDate}`,
          identity,
          meta: [
            { label: 'Gross Revenue', value: formatCurrency(data.grossRevenue || 0) },
            { label: 'Net Revenue', value: formatCurrency(data.revenue ?? data.netRevenue ?? 0) },
            { label: 'Net Profit', value: formatCurrency(data.profit || 0) }
          ],
          columns: [
            { header: 'Section', key: 'section', width: 28 },
            { header: 'Financial Metric', key: 'metric', width: 38 },
            { header: 'Amount', key: 'amount', type: 'currency', width: 20 }
          ],
          rows: plRows
        });
      } else if (tab === 'tax' && data) {
        const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
        const taxRows = breakdown.length > 0
          ? breakdown.map(b => [b.name || b.category || '', Number(b.rate || 0), Number(b.taxableAmount || 0), Number(b.taxAmount || 0)])
          : [['Standard Sales Tax (16%)', Number(data.taxRate || 0) * 100, Number(data.taxableRevenue || 0), Number(data.estimatedTax || 0)]];
        const totalTaxable = breakdown.length > 0
          ? breakdown.reduce((acc, b) => acc + Number(b.taxableAmount || 0), 0)
          : Number(data.taxableRevenue || 0);
        const totalTax = breakdown.length > 0
          ? breakdown.reduce((acc, b) => acc + Number(b.taxAmount || 0), 0)
          : Number(data.estimatedTax || 0);

        await generateExcel({
          fileName: `tax-report-${startDate}-to-${endDate}.xlsx`,
          sheetName: 'TaxReport',
          title: 'TAX SUMMARY & RATE BREAKDOWN',
          subtitle: `Period: ${startDate} to ${endDate}`,
          identity,
          meta: [
            { label: 'Taxable Turnover', value: formatCurrency(data.taxableRevenue || 0) },
            { label: 'Sales Tax Rate', value: `${((Number(data.taxRate || 0)) * 100).toFixed(2)}%` },
            { label: 'Estimated Tax Liability', value: formatCurrency(data.estimatedTax || 0) }
          ],
          columns: [
            { header: 'Tax Category', key: 'category', width: 30 },
            { header: 'Rate (%)', key: 'rate', type: 'number', width: 14 },
            { header: 'Taxable Turnover', key: 'taxable', type: 'currency', width: 22 },
            { header: 'Tax Liability', key: 'tax', type: 'currency', width: 22 }
          ],
          rows: taxRows,
          summaryRow: ['TOTAL', '-', totalTaxable, totalTax]
        });
      } else if (tab === 'insights') {
        const trajectory = (revVsExp && revVsExp.length > 0) ? revVsExp : (charts.salesTrend || []);
        const trajectoryRows = trajectory.map(r => [
          r.period || '',
          Number(r.revenue || 0),
          Number(r.expenses || 0),
          Number(r.revenue || 0) - Number(r.expenses || 0)
        ]);
        const sheets = [
          {
            sheetName: 'Revenue vs Expenses',
            title: 'BUSINESS TRENDS & AI INSIGHTS',
            subtitle: `Period: ${startDate} to ${endDate}`,
            identity,
            meta: [
              { label: 'Executive AI Analysis', value: insights ? (insights.length > 120 ? insights.substring(0, 117) + '...' : insights) : 'Analysis generated' }
            ],
            columns: [
              { header: 'Period', key: 'period', width: 18 },
              { header: 'Revenue', key: 'revenue', type: 'currency', width: 20 },
              { header: 'Operating Expenses', key: 'expenses', type: 'currency', width: 20 },
              { header: 'Net Margin', key: 'margin', type: 'currency', width: 20 }
            ],
            rows: trajectoryRows
          }
        ];
        if (charts.paymentBreakdown && charts.paymentBreakdown.length > 0) {
          sheets.push({
            sheetName: 'Payment Mix',
            title: 'PAYMENT CHANNEL MIX',
            subtitle: `Period: ${startDate} to ${endDate}`,
            identity,
            columns: [
              { header: 'Payment Method', key: 'method', width: 22 },
              { header: 'Transactions / Value', key: 'value', type: 'number', width: 22 }
            ],
            rows: charts.paymentBreakdown.map(p => [p.method || '', Number(p.value || 0)])
          });
        }
        await generateExcel({
          fileName: `business-insights-${startDate}-to-${endDate}.xlsx`,
          sheets
        });
      }
      toast.success('Report exported to Excel successfully');
    } catch (err) {
      console.error('Failed to export Excel:', err);
      toast.error('Failed to export Excel. Please try again.');
    } finally {
      setExporting(null);
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
      setExporting('pdf');
      if (tab === 'sales') {
        const salesTrend = charts.salesTrend || [];
        const salesRows = salesTrend.map(r => [
          r.period || '',
          String(r.sales ?? r.saleCount ?? 0),
          formatCurrency(r.revenue || 0),
          formatCurrency(r.tax || 0),
          formatCurrency(r.discount || 0)
        ]);
        const totalSales = salesTrend.reduce((acc, r) => acc + Number(r.sales ?? r.saleCount ?? 0), 0);
        const totalRevenue = salesTrend.reduce((acc, r) => acc + Number(r.revenue || 0), 0);
        const totalTax = salesTrend.reduce((acc, r) => acc + Number(r.tax || 0), 0);
        const totalDiscount = salesTrend.reduce((acc, r) => acc + Number(r.discount || 0), 0);

        const tables = [
          {
            title: 'Sales Volume & Trend',
            columns: [
              { header: 'Period', align: 'left', width: 35 },
              { header: 'Sales Count', align: 'right', width: 30 },
              { header: 'Revenue', align: 'right', width: 40 },
              { header: 'Tax', align: 'right', width: 35 },
              { header: 'Discount', align: 'right', width: 35 }
            ],
            rows: salesRows,
            summaryRow: ['TOTAL', String(totalSales), formatCurrency(totalRevenue), formatCurrency(totalTax), formatCurrency(totalDiscount)]
          }
        ];

        if (charts.paymentBreakdown && charts.paymentBreakdown.length > 0) {
          tables.push({
            title: 'Payment Method Breakdown',
            columns: [
              { header: 'Payment Method', align: 'left', width: 90 },
              { header: 'Total Value / Volume', align: 'right', width: 85 }
            ],
            rows: charts.paymentBreakdown.map(p => [p.method || '', formatCurrency(p.value || 0)])
          });
        }

        if (charts.topEmployees && charts.topEmployees.length > 0) {
          tables.push({
            title: 'Top Employees by Revenue',
            columns: [
              { header: 'Staff Member', align: 'left', width: 90 },
              { header: 'Revenue Generated', align: 'right', width: 85 }
            ],
            rows: charts.topEmployees.map(e => [e.name || '', formatCurrency(e.revenue || 0)])
          });
        }

        await generatePDF({
          fileName: `sales-summary-${startDate}-to-${endDate}.pdf`,
          title: 'SALES SUMMARY REPORT',
          subtitle: `Period: ${startDate} to ${endDate}${selectedCashierName ? ` | Cashier: ${selectedCashierName}` : ''}`,
          identity,
          summaryCards: [
            { label: 'Total Revenue', value: formatCurrency(kpis.revenue) },
            { label: 'Total Sales', value: String(kpis.sales) },
            { label: 'Gross Profit', value: formatCurrency(kpis.grossProfit || 0) },
            { label: 'Active Customers', value: String(kpis.activeCustomers) }
          ],
          tables
        });
      } else if (tab === 'cashier') {
        const empRows = (data?.employees && Array.isArray(data.employees)) ? data.employees : (charts.topEmployees || []);
        const cashierRows = empRows.map(e => [
          e.performerName || e.name || 'Staff Member',
          e.role || 'Cashier',
          String(e.totalSales || e.sales || 0),
          formatCurrency(e.totalRevenue || e.revenue || 0),
          formatCurrency(e.averageSaleValue || (e.totalSales > 0 ? (e.totalRevenue / e.totalSales) : 0))
        ]);
        const totalStaffOrders = empRows.reduce((sum, e) => sum + Number(e.totalSales || e.sales || 0), 0);
        const totalStaffRev = empRows.reduce((sum, e) => sum + Number(e.totalRevenue || e.revenue || 0), 0);

        const tables = [
          {
            title: 'Cashier & Staff Sales Performance',
            columns: [
              { header: 'Cashier / Staff Member', align: 'left', width: 55 },
              { header: 'Role', align: 'left', width: 30 },
              { header: 'Orders Handled', align: 'right', width: 30 },
              { header: 'Revenue Collected', align: 'right', width: 35 },
              { header: 'Average Ticket', align: 'right', width: 30 }
            ],
            rows: cashierRows,
            summaryRow: ['TOTAL', '', String(totalStaffOrders), formatCurrency(totalStaffRev), formatCurrency(totalStaffOrders > 0 ? totalStaffRev / totalStaffOrders : 0)]
          }
        ];

        if (charts.paymentBreakdown && charts.paymentBreakdown.length > 0) {
          tables.push({
            title: 'Register Payment Tender Breakdown',
            columns: [
              { header: 'Payment Method', align: 'left', width: 90 },
              { header: 'Collected Amount / Orders', align: 'right', width: 85 }
            ],
            rows: charts.paymentBreakdown.map(p => [p.method || '', formatCurrency(p.value || 0)])
          });
        }

        await generatePDF({
          fileName: `cashier-shift-report-${startDate}-to-${endDate}.pdf`,
          title: 'CASHIER & SHIFT RECONCILIATION REPORT',
          subtitle: `Period: ${startDate} to ${endDate}${selectedCashierName ? ` | Cashier: ${selectedCashierName}` : ''}`,
          identity,
          summaryCards: [
            { label: 'Shift Gross Revenue', value: formatCurrency(kpis.revenue) },
            { label: 'Shift Transactions', value: String(kpis.sales) },
            { label: 'Active Cashiers', value: String(empRows.length) },
            { label: 'Average Ticket', value: formatCurrency(kpis.sales > 0 ? kpis.revenue / kpis.sales : 0) }
          ],
          tables
        });
      } else if (tab === 'pl' && data) {
        const plRows = [
          ['Gross Revenue (Pre-Discount)', formatCurrency(data.grossRevenue || 0)],
          ['Total Tax (Sales Tax)', formatCurrency(data.totalTax || 0)],
          ['Discounts', formatCurrency(data.totalDiscount || 0)],
          ['Refunds', formatCurrency(data.totalRefunds || 0)],
          ['Net Revenue (after discounts & refunds)', formatCurrency(data.revenue ?? data.netRevenue ?? 0)],
          ['Cost of Goods Sold (COGS)', formatCurrency(data.cogs || 0)],
          ['Gross Profit', formatCurrency(data.grossProfit ?? ((data.revenue ?? data.netRevenue ?? 0) - (data.cogs || 0)))],
          ['Operating Expenses', formatCurrency(data.operatingExpenses ?? data.totalExpenses ?? 0)],
          ['Net Profit / (Loss)', formatCurrency(data.profit || 0)]
        ];
        await generatePDF({
          fileName: `profit-and-loss-${startDate}-to-${endDate}.pdf`,
          title: 'PROFIT & LOSS STATEMENT',
          subtitle: `Period: ${startDate} to ${endDate}`,
          identity,
          summaryCards: [
            { label: 'Gross Revenue', value: formatCurrency(data.grossRevenue || 0) },
            { label: 'Net Revenue', value: formatCurrency(data.revenue ?? data.netRevenue ?? 0) },
            { label: 'Operating Expenses', value: formatCurrency(data.operatingExpenses ?? data.totalExpenses ?? 0) },
            { label: 'Net Profit', value: formatCurrency(data.profit || 0) }
          ],
          columns: [
            { header: 'Financial Metric', align: 'left', width: 110 },
            { header: 'Amount', align: 'right', width: 65 }
          ],
          rows: plRows
        });
      } else if (tab === 'tax' && data) {
        const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
        const taxRows = breakdown.length > 0
          ? breakdown.map(b => [b.name || b.category || '', `${Number(b.rate || 0).toFixed(2)}%`, formatCurrency(b.taxableAmount || 0), formatCurrency(b.taxAmount || 0)])
          : [['Standard Sales Tax (16%)', `${((Number(data.taxRate || 0)) * 100).toFixed(2)}%`, formatCurrency(data.taxableRevenue || 0), formatCurrency(data.estimatedTax || 0)]];
        const totalTaxable = breakdown.length > 0
          ? breakdown.reduce((acc, b) => acc + Number(b.taxableAmount || 0), 0)
          : Number(data.taxableRevenue || 0);
        const totalTax = breakdown.length > 0
          ? breakdown.reduce((acc, b) => acc + Number(b.taxAmount || 0), 0)
          : Number(data.estimatedTax || 0);

        await generatePDF({
          fileName: `tax-report-${startDate}-to-${endDate}.pdf`,
          title: 'TAX SUMMARY & RATE BREAKDOWN',
          subtitle: `Period: ${startDate} to ${endDate}`,
          identity,
          summaryCards: [
            { label: 'Taxable Turnover', value: formatCurrency(data.taxableRevenue || 0) },
            { label: 'Sales Tax Rate', value: `${((Number(data.taxRate || 0)) * 100).toFixed(2)}%` },
            { label: 'Estimated Tax Liability', value: formatCurrency(data.estimatedTax || 0) }
          ],
          columns: [
            { header: 'Tax Category', align: 'left', width: 75 },
            { header: 'Rate (%)', align: 'center', width: 25 },
            { header: 'Taxable Turnover', align: 'right', width: 40 },
            { header: 'Tax Liability', align: 'right', width: 35 }
          ],
          rows: taxRows,
          summaryRow: ['TOTAL', '-', formatCurrency(totalTaxable), formatCurrency(totalTax)]
        });
      } else if (tab === 'insights') {
        const trajectory = (revVsExp && revVsExp.length > 0) ? revVsExp : (charts.salesTrend || []);
        const trajectoryRows = trajectory.map(r => [
          r.period || '',
          formatCurrency(r.revenue || 0),
          formatCurrency(r.expenses || 0),
          formatCurrency(Number(r.revenue || 0) - Number(r.expenses || 0))
        ]);
        const tables = [
          {
            title: 'Monthly Revenue vs Expenses Trajectory',
            columns: [
              { header: 'Period', align: 'left', width: 45 },
              { header: 'Revenue', align: 'right', width: 45 },
              { header: 'Operating Expenses', align: 'right', width: 45 },
              { header: 'Net Margin', align: 'right', width: 40 }
            ],
            rows: trajectoryRows
          }
        ];
        if (charts.paymentBreakdown && charts.paymentBreakdown.length > 0) {
          tables.push({
            title: 'Payment Channel Mix',
            columns: [
              { header: 'Payment Channel', align: 'left', width: 90 },
              { header: 'Recorded Units / Volume', align: 'right', width: 85 }
            ],
            rows: charts.paymentBreakdown.map(p => [p.method || '', String(p.value || 0)])
          });
        }
        await generatePDF({
          fileName: `business-insights-${startDate}-to-${endDate}.pdf`,
          title: 'BUSINESS TRENDS & AI INSIGHTS',
          subtitle: `Period: ${startDate} to ${endDate}`,
          identity,
          meta: [
            { label: 'Executive AI Analysis', value: insights ? (insights.length > 100 ? insights.substring(0, 97) + '...' : insights) : 'Trend analysis based on transaction history' }
          ],
          tables
        });
      }
      toast.success('Report exported to PDF successfully');
    } catch (err) {
      console.error('Failed to export PDF:', err);
      toast.error('Failed to export PDF. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Comprehensive sales summaries, cashier & shift reconciliation, profit & loss statements, tax reports, and AI business insights."
      />

      {/* Sticky Filter Toolbar */}
      <Card variant="default" className="p-4 sticky top-0 z-40 backdrop-blur-md bg-surface/95 !overflow-visible border border-border-default shadow-floating">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-1.5 bg-surface-2/70 p-1 rounded-xl border border-border-default">
            <TabButton active={tab === 'sales'} onClick={() => setTab('sales')}>Sales Summary</TabButton>
            <TabButton active={tab === 'cashier'} onClick={() => setTab('cashier')}>Cashier & Shifts</TabButton>
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
            <IconButton title="Export CSV" onClick={exportCsv} icon="csv" disabled={Boolean(exporting)} loading={exporting === 'csv'} />
            <IconButton title="Export Excel" onClick={exportExcel} icon="excel" disabled={Boolean(exporting)} loading={exporting === 'excel'} />
            <IconButton title="Export PDF" onClick={exportPdf} icon="pdf" disabled={Boolean(exporting)} loading={exporting === 'pdf'} />
            <IconButton title="Print" onClick={printReport} icon="print" disabled={Boolean(exporting)} loading={exporting === 'print'} />
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      {(tab === 'sales' || tab === 'cashier') && (
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
                              if (typeof value === 'string' && /^\\d{2}:\\d{2}$/.test(value)) return value;
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
                              if (typeof value === 'string' && /^\\d{2}:\\d{2}$/.test(value)) return value;
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

            {tab === 'cashier' && (
              <div className="space-y-6">
                <Card variant="default">
                  <Card.Header
                    title="Cashier & Shift Reconciliation"
                    subtitle={`Staff sales performance and register totals for ${startDate} to ${endDate}${selectedCashierName ? ` (Filtered: ${selectedCashierName})` : ''}`}
                  />
                  <Card.Body>
                    <div className="overflow-x-auto">
                      {(!data?.employees || data.employees.length === 0) ? (
                        <div className="p-8 text-center text-text-secondary">
                          <UserGroupIcon className="h-10 w-10 text-text-muted mx-auto mb-2 stroke-1" aria-hidden="true" />
                          <p className="font-semibold text-text-primary text-small">No cashier shift records found</p>
                          <p className="text-caption text-text-muted mt-1">There are no sales transactions attributed to staff for this selected timeframe.</p>
                        </div>
                      ) : (
                        <table className="w-full text-small text-left border-collapse">
                          <thead>
                            <tr className="border-b border-border-default text-text-secondary">
                              <th className="py-3 px-4 font-semibold">Staff Member</th>
                              <th className="py-3 px-4 font-semibold">Position / Role</th>
                              <th className="py-3 px-4 font-semibold text-right">Orders Handled</th>
                              <th className="py-3 px-4 font-semibold text-right">Total Revenue</th>
                              <th className="py-3 px-4 font-semibold text-right">Average Ticket</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-default">
                            {data.employees.map((e, idx) => (
                              <tr key={e.performerId || idx} className="hover:bg-surface-2/40 transition-colors">
                                <td className="py-3 px-4 font-medium text-text-primary flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-caption">
                                    {(e.performerName || 'S').charAt(0).toUpperCase()}
                                  </div>
                                  <span>{e.performerName || 'Unknown Staff'}</span>
                                </td>
                                <td className="py-3 px-4 text-text-secondary">{e.role || 'Cashier'}</td>
                                <td className="py-3 px-4 text-right font-medium text-text-primary">{e.totalSales || 0}</td>
                                <td className="py-3 px-4 text-right font-semibold text-text-primary">{formatCurrency(e.totalRevenue || 0)}</td>
                                <td className="py-3 px-4 text-right text-text-secondary">{formatCurrency(e.averageSaleValue || 0)}</td>
                              </tr>
                            ))}
                            <tr className="bg-surface-2/60 font-bold border-t-2 border-border-default">
                              <td className="py-3 px-4 text-text-primary" colSpan="2">TOTAL</td>
                              <td className="py-3 px-4 text-right text-text-primary">
                                {data.employees.reduce((acc, e) => acc + Number(e.totalSales || 0), 0)}
                              </td>
                              <td className="py-3 px-4 text-right text-text-primary">
                                {formatCurrency(data.employees.reduce((acc, e) => acc + Number(e.totalRevenue || 0), 0))}
                              </td>
                              <td className="py-3 px-4 text-right text-text-primary">
                                {formatCurrency(
                                  data.employees.reduce((acc, e) => acc + Number(e.totalSales || 0), 0) > 0
                                    ? data.employees.reduce((acc, e) => acc + Number(e.totalRevenue || 0), 0) / data.employees.reduce((acc, e) => acc + Number(e.totalSales || 0), 0)
                                    : 0
                                )}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  </Card.Body>
                </Card>

                {charts.paymentBreakdown && charts.paymentBreakdown.length > 0 && (
                  <Card variant="default">
                    <Card.Header
                      title="Payment Tender Distribution"
                      subtitle="Tender breakdown across all completed cashier transactions"
                    />
                    <Card.Body>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        {charts.paymentBreakdown.map((p, idx) => (
                          <div key={idx} className="p-4 rounded-xl border border-border-default bg-surface-2/40">
                            <div className="text-caption font-semibold uppercase tracking-wider text-text-muted">{p.method}</div>
                            <div className="text-h4 font-bold text-text-primary mt-1">{formatCurrency(p.value || 0)}</div>
                          </div>
                        ))}
                      </div>
                    </Card.Body>
                  </Card>
                )}
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

      {/* Pre-rendered Isolated Print View for Browser Print Preview (A4 UDDS)
          Pre-rendered in DOM with class "print-only" to eliminate print-lifecycle race conditions.
          aria-hidden="true" ensures screen readers and test query selectors ignore this pre-rendered view. */}
      <div className="print-only" aria-hidden="true">
        <PrintableDocumentContainer
          title={
            tab === 'sales'
              ? 'SALES SUMMARY REPORT'
              : tab === 'cashier'
              ? 'CASHIER & SHIFT RECONCILIATION REPORT'
              : tab === 'pl'
              ? 'PROFIT & LOSS STATEMENT'
              : tab === 'tax'
              ? 'TAX SUMMARY & ESTIMATE REPORT'
              : 'BUSINESS TRENDS & AI INSIGHTS'
          }
          subtitle={`Period: ${startDate} to ${endDate}${selectedCashierName ? ` | Cashier: ${selectedCashierName}` : ''}`}
          identity={identity}
          meta={[
            { label: 'Tab', value: tab.toUpperCase() },
            { label: 'Granularity', value: range.toUpperCase() },
            ...(cashierId ? [{ label: 'Cashier ID', value: cashierId }] : []),
            ...(categoryId ? [{ label: 'Category ID', value: categoryId }] : [])
          ]}
        >
          {tab === 'sales' && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded border border-slate-200">
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Turnover Revenue</div>
                  <div className="text-lg font-bold text-slate-800">Gross: {formatCurrency(kpis.revenue)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Completed Orders</div>
                  <div className="text-lg font-bold text-slate-800">{kpis.sales}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Gross Profit Margin</div>
                  <div className="text-lg font-bold text-slate-800">{formatCurrency(kpis.grossProfit || 0)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Clients Served</div>
                  <div className="text-lg font-bold text-slate-800">{kpis.activeCustomers}</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">Sales Volume & Trajectory Ledger</h3>
                {(!charts.salesTrend || charts.salesTrend.length === 0) ? (
                  <p className="text-xs text-slate-500 italic p-4 bg-slate-50 rounded">No sales records found for this period.</p>
                ) : (
                  <table className="w-full text-xs text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="p-2 border border-slate-200">Period</th>
                        <th className="p-2 border border-slate-200 text-right">Sales Count</th>
                        <th className="p-2 border border-slate-200 text-right">Revenue</th>
                        <th className="p-2 border border-slate-200 text-right">Tax</th>
                        <th className="p-2 border border-slate-200 text-right">Discount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {charts.salesTrend.map((r, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td className="p-2 border border-slate-200">{r.period || ''}</td>
                          <td className="p-2 border border-slate-200 text-right">{r.sales ?? r.saleCount ?? 0}</td>
                          <td className="p-2 border border-slate-200 text-right">{formatCurrency(r.revenue || 0)}</td>
                          <td className="p-2 border border-slate-200 text-right">{formatCurrency(r.tax || 0)}</td>
                          <td className="p-2 border border-slate-200 text-right">{formatCurrency(r.discount || 0)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-bold">
                        <td className="p-2 border border-slate-200">TOTAL</td>
                        <td className="p-2 border border-slate-200 text-right">
                          {charts.salesTrend.reduce((acc, r) => acc + Number(r.sales ?? r.saleCount ?? 0), 0)}
                        </td>
                        <td className="p-2 border border-slate-200 text-right">
                          {formatCurrency(charts.salesTrend.reduce((acc, r) => acc + Number(r.revenue || 0), 0))}
                        </td>
                        <td className="p-2 border border-slate-200 text-right">
                          {formatCurrency(charts.salesTrend.reduce((acc, r) => acc + Number(r.tax || 0), 0))}
                        </td>
                        <td className="p-2 border border-slate-200 text-right">
                          {formatCurrency(charts.salesTrend.reduce((acc, r) => acc + Number(r.discount || 0), 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === 'cashier' && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded border border-slate-200">
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Shift Revenue</div>
                  <div className="text-lg font-bold text-slate-800">Collected: {formatCurrency(kpis.revenue)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Shift Transactions</div>
                  <div className="text-lg font-bold text-slate-800">{kpis.sales}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Staff Count</div>
                  <div className="text-lg font-bold text-slate-800">{data?.employees?.length || 0}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Average Ticket</div>
                  <div className="text-lg font-bold text-slate-800">{formatCurrency(kpis.sales > 0 ? kpis.revenue / kpis.sales : 0)}</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">Staff Sales Ledger</h3>
                {(!data?.employees || data.employees.length === 0) ? (
                  <p className="text-xs text-slate-500 italic p-4 bg-slate-50 rounded">No cashier shift records found.</p>
                ) : (
                  <table className="w-full text-xs text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="p-2 border border-slate-200">Staff Member</th>
                        <th className="p-2 border border-slate-200">Role</th>
                        <th className="p-2 border border-slate-200 text-right">Orders Handled</th>
                        <th className="p-2 border border-slate-200 text-right">Revenue Collected</th>
                        <th className="p-2 border border-slate-200 text-right">Average Ticket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.employees.map((e, idx) => (
                        <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td className="p-2 border border-slate-200 font-medium">Staff: {e.performerName || 'Staff'}</td>
                          <td className="p-2 border border-slate-200">{e.role || 'Cashier'}</td>
                          <td className="p-2 border border-slate-200 text-right">{e.totalSales || 0}</td>
                          <td className="p-2 border border-slate-200 text-right font-medium">{formatCurrency(e.totalRevenue || 0)}</td>
                          <td className="p-2 border border-slate-200 text-right">{formatCurrency(e.averageSaleValue || 0)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-bold">
                        <td className="p-2 border border-slate-200" colSpan="2">TOTAL</td>
                        <td className="p-2 border border-slate-200 text-right">
                          {data.employees.reduce((acc, e) => acc + Number(e.totalSales || 0), 0)}
                        </td>
                        <td className="p-2 border border-slate-200 text-right">
                          {formatCurrency(data.employees.reduce((acc, e) => acc + Number(e.totalRevenue || 0), 0))}
                        </td>
                        <td className="p-2 border border-slate-200 text-right">
                          {formatCurrency(
                            data.employees.reduce((acc, e) => acc + Number(e.totalSales || 0), 0) > 0
                              ? data.employees.reduce((acc, e) => acc + Number(e.totalRevenue || 0), 0) / data.employees.reduce((acc, e) => acc + Number(e.totalSales || 0), 0)
                              : 0
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === 'pl' && data && (
            <div className="space-y-6">
              <table className="w-full text-xs text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="p-2 border border-slate-200">Section</th>
                    <th className="p-2 border border-slate-200">Financial Metric</th>
                    <th className="p-2 border border-slate-200 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="p-2 border border-slate-200" rowSpan="4">Revenue & Adjustments</td><td className="p-2 border border-slate-200">P&L: Gross Revenue (Pre-Discount)</td><td className="p-2 border border-slate-200 text-right">{formatCurrency(data.grossRevenue || 0)}</td></tr>
                  <tr><td className="p-2 border border-slate-200">P&L: Total Tax (Sales Tax)</td><td className="p-2 border border-slate-200 text-right">{formatCurrency(data.totalTax || 0)}</td></tr>
                  <tr><td className="p-2 border border-slate-200">P&L: Discounts</td><td className="p-2 border border-slate-200 text-right">{formatCurrency(data.totalDiscount || 0)}</td></tr>
                  <tr><td className="p-2 border border-slate-200">P&L: Refunds</td><td className="p-2 border border-slate-200 text-right">{formatCurrency(data.totalRefunds || 0)}</td></tr>
                  <tr><td className="p-2 border border-slate-200" rowSpan="3">Direct Costs & Margins</td><td className="p-2 border border-slate-200 font-semibold">P&L: Net Revenue</td><td className="p-2 border border-slate-200 text-right font-semibold">{formatCurrency(data.revenue ?? data.netRevenue ?? 0)}</td></tr>
                  <tr><td className="p-2 border border-slate-200">P&L: Cost of Goods Sold</td><td className="p-2 border border-slate-200 text-right">{formatCurrency(data.cogs || 0)}</td></tr>
                  <tr className="bg-emerald-50"><td className="p-2 border border-slate-200 font-bold text-emerald-800">P&L: Gross Profit</td><td className="p-2 border border-slate-200 text-right font-bold text-emerald-800">{formatCurrency(data.grossProfit ?? ((data.revenue ?? data.netRevenue ?? 0) - (data.cogs || 0)))}</td></tr>
                  <tr><td className="p-2 border border-slate-200" rowSpan="2">Operating Costs & Bottom Line</td><td className="p-2 border border-slate-200">P&L: Operating Expenses</td><td className="p-2 border border-slate-200 text-right">{formatCurrency(data.operatingExpenses ?? data.totalExpenses ?? 0)}</td></tr>
                  <tr className="bg-emerald-100"><td className="p-2 border border-slate-200 font-bold text-emerald-900">P&L: Net Profit / (Loss)</td><td className="p-2 border border-slate-200 text-right font-bold text-emerald-900">{formatCurrency(data.profit || 0)}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          {tab === 'tax' && data && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded border border-slate-200">
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Taxable Turnover Base</div>
                  <div className="text-lg font-bold text-slate-800">Base: {formatCurrency(data.taxableRevenue || 0)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Applicable Tax Rate</div>
                  <div className="text-lg font-bold text-slate-800">Rate: {`${((Number(data.taxRate || 0)) * 100).toFixed(2)}%`}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500 font-semibold">Estimated Tax Liability</div>
                  <div className="text-lg font-bold text-emerald-700">{formatCurrency(data.estimatedTax || 0)}</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">Tax Rate & Category Breakdown</h3>
                <table className="w-full text-xs text-left border-collapse border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="p-2 border border-slate-200">Tax Category</th>
                      <th className="p-2 border border-slate-200 text-center">Rate (%)</th>
                      <th className="p-2 border border-slate-200 text-right">Taxable Turnover</th>
                      <th className="p-2 border border-slate-200 text-right">Tax Liability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(data.breakdown) && data.breakdown.length > 0) ? (
                      data.breakdown.map((b, i) => (
                        <tr key={i} className={i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td className="p-2 border border-slate-200">{b.name || b.category}</td>
                          <td className="p-2 border border-slate-200 text-center">Rate: {Number(b.rate || 0).toFixed(2)}%</td>
                          <td className="p-2 border border-slate-200 text-right">{formatCurrency(b.taxableAmount || 0)}</td>
                          <td className="p-2 border border-slate-200 text-right">{formatCurrency(b.taxAmount || 0)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-2 border border-slate-200">Standard Sales Tax (16%)</td>
                        <td className="p-2 border border-slate-200 text-center">Rate: {`${((Number(data.taxRate || 0)) * 100).toFixed(2)}%`}</td>
                        <td className="p-2 border border-slate-200 text-right">{formatCurrency(data.taxableRevenue || 0)}</td>
                        <td className="p-2 border border-slate-200 text-right">{formatCurrency(data.estimatedTax || 0)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'insights' && (
            <div className="space-y-6">
              {insights && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded text-slate-800 text-xs leading-relaxed">
                  <div className="font-bold text-amber-900 uppercase tracking-wide mb-1">Executive Performance Assessment</div>
                  <p>Automated Briefing: Historical velocity and channel breakdown indicate continuous operational expansion.</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-2">Monthly Trajectory</h3>
                <table className="w-full text-xs text-left border-collapse border border-slate-200">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="p-2 border border-slate-200">Period</th>
                      <th className="p-2 border border-slate-200 text-right">Revenue</th>
                      <th className="p-2 border border-slate-200 text-right">Operating Expenses</th>
                      <th className="p-2 border border-slate-200 text-right">Net Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((revVsExp && revVsExp.length > 0) ? revVsExp : (charts.salesTrend || [])).map((r, i) => (
                      <tr key={i} className={i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="p-2 border border-slate-200">{r.period || ''}</td>
                        <td className="p-2 border border-slate-200 text-right">{formatCurrency(r.revenue || 0)}</td>
                        <td className="p-2 border border-slate-200 text-right">{formatCurrency(r.expenses || 0)}</td>
                        <td className="p-2 border border-slate-200 text-right font-semibold">
                          {formatCurrency(Number(r.revenue || 0) - Number(r.expenses || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </PrintableDocumentContainer>
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

function IconButton({ title, onClick, icon, disabled, loading }) {
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
      disabled={disabled}
      className={`p-2 rounded-xl border border-border-default bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {loading ? (
        <div className="w-[18px] h-[18px] border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      ) : (
        icons[icon]
      )}
    </button>
  );
}
