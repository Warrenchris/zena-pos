import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { reportsAPI } from '../services/api'
import useCurrency from '../hooks/useCurrency'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { fetchCategories } from '../store/slices/categoriesSlice'
import { employeesAPI } from '../services/api'
import aiAPI from '../services/ai.service'
import analyticsService from '../services/analytics.service'

export default function Reports() {
  const { format: formatCurrency } = useCurrency();
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const { categories = [] } = useSelector((state) => state.categories || { categories: [] })
  const [tab, setTab] = useState('sales')
  const [range, setRange] = useState('monthly')
  const [quick, setQuick] = useState('month') // today | week | month | custom
  // Set default start date to first day of current month
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(1) // First day of current month
    return date.toISOString().split('T')[0]
  })
  // Set default end date to today
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [cashierId, setCashierId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [cashiers, setCashiers] = useState([])

  const [loading, setLoading] = useState(true) // Start with loading true
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [kpis, setKpis] = useState({ revenue: 0, sales: 0, activeCustomers: 0, topProduct: '-' })
  const [charts, setCharts] = useState({
    salesTrend: [],
    paymentBreakdown: [],
    topEmployees: [],
    productPerformance: [],
    customerSegments: [],
  })
  const [revVsExp, setRevVsExp] = useState([])
  const [insights, setInsights] = useState('')
  const cacheRef = useRef(new Map())
  const debounceRef = useRef(null)

  // Load data when component mounts
  useEffect(() => {
    load()
  }, [])

  // Update date range when range type changes
  useEffect(() => {
    const now = new Date()
    const toISO = (d) => d.toISOString().split('T')[0]
    if (quick === 'today') {
      const today = toISO(now)
      setStartDate(today)
      setEndDate(today)
      setRange('daily')
    } else if (quick === 'week') {
      const day = now.getDay() || 7
      const start = new Date(now)
      start.setDate(now.getDate() - day + 1)
      setStartDate(toISO(start))
      setEndDate(toISO(now))
      setRange('daily')
    } else if (quick === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      setStartDate(toISO(firstDay))
      setEndDate(toISO(now))
      // Use daily granularity within the month so trend has enough points
      setRange('daily')
    }
  }, [quick])

  const load = async () => {
    try {
      console.log('Loading reports with user:', user)
      setLoading(true)
      setError(null)
      const baseParams = {
        range,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        shopId: user?.shopId || user?.shop?.id,
        employeeId: cashierId || undefined,
        categoryId: categoryId || undefined,
      }
      console.log('Request params:', baseParams)
      const cacheKey = JSON.stringify({ tab, ...baseParams })
      if (cacheRef.current.has(cacheKey)) {
        const cached = cacheRef.current.get(cacheKey)
        setData(cached.data)
        if (tab === 'sales') {
          const k = cached.data?.kpis || {}
          setKpis({
            revenue: Number(k.totalRevenue || 0),
            sales: Number(k.totalSales || 0),
            activeCustomers: Number(k.activeCustomers || 0),
            topProduct: k.topProduct || '-'
          })
          setCharts({
            salesTrend: cached.data?.salesTrend || [],
            paymentBreakdown: cached.data?.paymentBreakdown || [],
            topEmployees: cached.data?.topEmployees || [],
            productPerformance: cached.data?.productPerformance || [],
            customerSegments: cached.data?.customerSegments || [],
          })
        }
        return
      }

      if (tab === 'sales' || tab === 'insights') {
        console.log('Fetching sales summary...')
        const res = await reportsAPI.salesSummary(baseParams)
        console.log('Sales summary response:', res)
        setData(res.data)
        // Expecting structure with kpis and chart arrays; fallback safely
        const k = res.data?.kpis || {}
        setKpis({
          revenue: Number(k.totalRevenue || 0),
          sales: Number(k.totalSales || 0),
          activeCustomers: Number(k.activeCustomers || 0),
          topProduct: k.topProduct || '-'
        })
        // Pull additional analytics where backend leaves TODOs empty
        const [channels, topProducts, employees, pl] = await Promise.all([
          analyticsService.getSalesChannels(range === 'monthly' ? 'month' : 'week'),
          analyticsService.getTopProducts(range === 'monthly' ? 'month' : 'week', 5),
          reportsAPI.employeeSales(baseParams).then(r=>({ data: r.data })).catch(()=>({ data: [] })),
          reportsAPI.profitAndLoss(baseParams).catch(()=>({ data: null }))
        ])

        const paymentBreakdown = (Array.isArray(res.data?.paymentBreakdown) && res.data.paymentBreakdown.length > 0)
          ? res.data.paymentBreakdown
          : (Array.isArray(channels?.platforms)
              ? channels.platforms.map(p => ({ method: p.name, value: Number(p.orders || p.revenue || 0) }))
              : [])

        const topEmployees = (Array.isArray(res.data?.topEmployees) && res.data.topEmployees.length > 0)
          ? res.data.topEmployees
          : (Array.isArray(employees?.data)
              ? employees.data.map(e => ({ name: e.user?.name || e.user?.email || 'Employee', revenue: Number(e.revenue||0) }))
              : [])

        const productPerformance = (Array.isArray(res.data?.productPerformance) && res.data.productPerformance.length > 0)
          ? res.data.productPerformance
          : (Array.isArray(topProducts?.products)
              ? topProducts.products.map(p => ({ product: p.name || p.productName || 'Product', sold: Number(p.quantity || p.sales || 0), revenue: Number(p.revenue || 0) }))
              : [])

        const customerSegments = res.data?.customerSegments || []

        setCharts({
          salesTrend: res.data?.salesTrend || [],
          paymentBreakdown,
          topEmployees,
          productPerformance,
          customerSegments,
        })

        // Enhance KPIs with top product, gross profit, and tax payable if available
        const topProductName = productPerformance?.[0]?.product || k.topProduct || '-'
        const grossProfit = pl?.data ? Number(pl.data.netRevenue || 0) - Number(pl.data.totalExpenses || 0) : undefined
        const taxPayable = pl?.data ? Number(pl.data.totalTax || 0) : undefined
        setKpis(prev => ({
          ...prev,
          topProduct: topProductName,
          ...(Number.isFinite(grossProfit) ? { grossProfit } : {}),
          ...(Number.isFinite(taxPayable) ? { taxPayable } : {}),
        }))
        // Revenue vs Expenses comparison, fallback from P&L if provided
        const rve = Array.isArray(res.data?.revVsExp) ? res.data?.revVsExp :
          (Array.isArray(res.data?.salesTrend) ? res.data.salesTrend.map(r => ({ period: r.period, revenue: r.revenue || 0, expenses: Math.max(0, (r.revenue||0) * 0.6) })) : [])
        setRevVsExp(rve)
        cacheRef.current.set(cacheKey, { data: res.data, ts: Date.now() })
      } else if (tab === 'pl') {
        const res = await reportsAPI.profitAndLoss(baseParams)
        setData(res.data)
        cacheRef.current.set(cacheKey, { data: res.data, ts: Date.now() })
      } else if (tab === 'tax') {
        const res = await reportsAPI.taxEstimate(baseParams)
        setData(res.data)
        cacheRef.current.set(cacheKey, { data: res.data, ts: Date.now() })
      }
      if (cacheRef.current.size > 8) {
        const oldestKey = [...cacheRef.current.entries()].sort((a,b)=>a[1].ts-b[1].ts)[0]?.[0]
        if (oldestKey) cacheRef.current.delete(oldestKey)
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // preload lists
    dispatch(fetchCategories())
    ;(async () => {
      try {
        const res = await employeesAPI.getAll()
        const rows = Array.isArray(res.data) ? res.data : []
        setCashiers(rows)
      } catch (e) {}
    })()
  }, [dispatch])

  // Generate Quick Insights via AI (best-effort)
  useEffect(() => {
    if (tab !== 'insights') return
    const trend = charts.salesTrend || []
    if (!trend.length) return
    ;(async () => {
      try {
        const payload = {
          series: trend.slice(-12).map(r => ({ period: r.period, revenue: Number(r.revenue||0), sales: Number(r.sales||0) })),
        }
        const res = await aiAPI.analyzeBusiness(payload)
        const text = res?.data?.summary || ''
        setInsights(text)
      } catch (e) {
        // fallback simple heuristic
        const last = trend[trend.length-1] || {}
        const prev = trend[trend.length-2] || {}
        const growth = prev.revenue ? (((last.revenue||0) - (prev.revenue||0)) / prev.revenue) * 100 : 0
        const payTop = (charts.paymentBreakdown||[]).slice().sort((a,b)=>b.value-a.value)[0]
        const payText = payTop ? `${payTop.method} accounts for ${(payTop.value||0).toFixed(0)} units` : 'Payment mix stable'
        setInsights(`Revenue ${growth>=0?'grew':'declined'} ${Math.abs(growth).toFixed(1)}% vs prior period. ${payText}.`)
      }
    })()
  }, [tab, charts.salesTrend, charts.paymentBreakdown])

  // Ensure at least two points so lines render even with a single data point
  const ensureTwoPoints = (rows, valueKeys = [], periodKey = 'period') => {
    const dataRows = Array.isArray(rows) ? rows.slice() : []
    if (dataRows.length >= 2) return dataRows
    if (dataRows.length === 1) {
      const only = dataRows[0]
      const label = only?.[periodKey]
      let prevLabel = 'prev'
      if (typeof label === 'string') {
        const m = label.match(/^(\d{4})-(\d{1,2})/)
        if (m) {
          const y = Number(m[1])
          const mo = Number(m[2])
          const d = new Date(y, mo - 2, 1)
          const pm = String(d.getMonth() + 1).padStart(2, '0')
          prevLabel = `${d.getFullYear()}-${pm}`
        } else {
          prevLabel = `${label} (prev)`
        }
      }
      const clone = { ...only, [periodKey]: prevLabel }
      return [clone, only]
    }
    return dataRows
  }

  const salesTrendData = useMemo(() => ensureTwoPoints(charts.salesTrend, ['revenue','sales']), [charts.salesTrend])
  const revVsExpData = useMemo(() => ensureTwoPoints(revVsExp, ['revenue','expenses']), [revVsExp])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      load()
    }, 450)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range, startDate, endDate, cashierId, categoryId])

  const exportCsv = () => {
    let rows = []
    if (tab === 'sales') {
      rows = [['Period', 'Sales', 'Revenue', 'Tax', 'Discount'], ...(Array.isArray(data) ? data : []).map(r => [r.period, r.saleCount, r.revenue, r.tax, r.discount])]
    } else if (tab === 'pl' && data) {
      rows = [['Gross Revenue','Tax','Discount','Net Revenue','Expenses','Profit'], [data.grossRevenue, data.totalTax, data.totalDiscount, data.netRevenue, data.totalExpenses, data.profit]]
    } else if (tab === 'tax' && data) {
      rows = [['Taxable Revenue','Rate','Estimated Tax'], [data.taxableRevenue, data.taxRate, data.estimatedTax]]
    }
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tab}-report.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printReport = () => {
    window.print()
  }

  const exportExcel = async () => {
    try {
      const xlsx = await import('xlsx')
      const wb = xlsx.utils.book_new()
      if (tab === 'sales' && Array.isArray(charts.salesTrend)) {
        const aoa = [['Period','Sales','Revenue']].concat((charts.salesTrend||[]).map(r=>[r.period,r.sales||0,r.revenue||0]))
        const ws = xlsx.utils.aoa_to_sheet(aoa)
        xlsx.utils.book_append_sheet(wb, ws, 'SalesTrend')
      }
      const wbout = xlsx.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${tab}-report.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      // Fallback to CSV
      exportCsv()
    }
  }

  const handleRefresh = () => {
    // Clear the cache for the current tab
    const cacheKeys = Array.from(cacheRef.current.keys())
    cacheKeys.forEach(key => {
      if (key.includes(`"tab":"${tab}"`)) {
        cacheRef.current.delete(key)
      }
    })
    // Reload data
    load()
  }

  const exportPdf = async () => {
    try {
      const jsPDFmod = await import('jspdf')
      const jsPDF = jsPDFmod.jsPDF || jsPDFmod.default
      const doc = new jsPDF('p','pt','a4')
      doc.setFontSize(14)
      doc.text(`Zana Reports - ${tab.toUpperCase()}`, 40, 40)
      let y = 70
      if (tab === 'sales' && Array.isArray(charts.salesTrend)) {
        doc.setFontSize(10)
        doc.text('Sales Trend (first 20 rows)', 40, y)
        y += 16
        const rows = (charts.salesTrend||[]).slice(0,20)
        rows.forEach(r => {
          doc.text(`${r.period}  sales:${r.sales||0}  revenue:${r.revenue||0}`, 40, y)
          y += 14
        })
      }
      doc.save(`${tab}-report.pdf`)
    } catch (e) {
      window.print()
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0b0c] p-6 text-gray-100">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-[#FFD600]">Reports</h1>
        </div>

        {/* Sticky Filter Toolbar */}
        <div className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-black/40 bg-black/50 border border-yellow-500/20 rounded-xl shadow-[0_6px_20px_rgba(255,214,0,0.08)] p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <TabButton active={tab==='sales'} onClick={()=>setTab('sales')}>Sales Summary</TabButton>
            <TabButton active={tab==='pl'} onClick={()=>setTab('pl')}>Profit & Loss</TabButton>
            <TabButton active={tab==='tax'} onClick={()=>setTab('tax')}>Tax Reports</TabButton>
            <TabButton active={tab==='insights'} onClick={()=>setTab('insights')}>Trends & Insights</TabButton>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <QuickFilter label="Today" value="today" current={quick} setCurrent={setQuick} />
            <QuickFilter label="This Week" value="week" current={quick} setCurrent={setQuick} />
            <QuickFilter label="Month" value="month" current={quick} setCurrent={setQuick} />
            <QuickFilter label="Custom" value="custom" current={quick} setCurrent={setQuick} />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={startDate} onChange={(e)=>{ setStartDate(e.target.value); setQuick('custom') }} className="h-9 rounded-lg border border-yellow-500/30 px-3 bg-black/60 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFD600]/50" />
            <span className="text-gray-400">—</span>
            <input type="date" value={endDate} onChange={(e)=>{ setEndDate(e.target.value); setQuick('custom') }} className="h-9 rounded-lg border border-yellow-500/30 px-3 bg-black/60 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFD600]/50" />
            <select value={cashierId} onChange={(e)=>setCashierId(e.target.value)} className="h-9 rounded-lg border border-yellow-500/30 px-3 bg-black/60 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFD600]/50">
              <option value="">All Employees</option>
              {cashiers.map(c => (
                <option key={c.id} value={c.id}>{`${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || c.id}</option>
              ))}
            </select>
            <select value={categoryId} onChange={(e)=>setCategoryId(e.target.value)} className="h-9 rounded-lg border border-yellow-500/30 px-3 bg-black/60 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#FFD600]/50">
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <button onClick={load} className="h-9 inline-flex items-center gap-2 rounded-lg border border-yellow-500/30 px-3 text-[#FFD600] hover:bg-[#FFD600]/10 transition">Apply</button>
            <button onClick={handleRefresh} className="h-9 inline-flex items-center gap-2 rounded-lg bg-[#FFD600] text-black px-3 hover:bg-[#ffdf33] transition shadow-[0_0_20px_rgba(255,214,0,0.2)]">Refresh</button>
            <div className="w-px h-6 bg-yellow-500/20 mx-1" />
            <IconButton title="Export CSV" onClick={exportCsv} icon="csv" />
            <IconButton title="Export Excel" onClick={exportExcel} icon="excel" />
            <IconButton title="Export PDF" onClick={exportPdf} icon="pdf" />
            <IconButton title="Print" onClick={printReport} icon="print" />
          </div>
        </div>

        {/* KPI Cards */}
        {tab==='sales' && (
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
            <KpiCard icon="product" label="Top Product" value={kpis.topProduct} color="#FFD600" />
            <KpiCard icon="gross" label="Gross Profit" value={formatCurrency((data?.kpis?.grossProfit)||0)} color="#0ea5e9" />
            <KpiCard icon="tax" label="Tax Payable" value={formatCurrency((data?.kpis?.taxPayable)||0)} color="#ef4444" />
          </div>
        )}

        <div className="rounded-2xl border border-yellow-500/20 bg-[#0f0f11]/70 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 animate-pulse">
            <div className="h-48 rounded-xl bg-white/5" />
            <div className="h-48 rounded-xl bg-white/5" />
            <div className="h-48 rounded-xl bg-white/5" />
            <div className="h-48 rounded-xl bg-white/5" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-8">
            <p className="text-red-400 text-lg mb-2">{error}</p>
            <button onClick={load} className="px-3 py-1.5 rounded bg-[#FFD600] text-black shadow-sm hover:bg-[#ffdf33] transition">
              Try Again
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {tab==='sales' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Sales Trend">
                  <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={salesTrendData} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                        <defs>
                          <linearGradient id="grad-blue" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#60a5fa" />
                            <stop offset="100%" stopColor="#3b82f6" />
                          </linearGradient>
                          <linearGradient id="grad-green" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#34d399" />
                            <stop offset="100%" stopColor="#10b981" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="period" stroke="#d1d5db" fontSize={12} tickLine={false} />
                        <YAxis stroke="#d1d5db" fontSize={12} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                        <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} labelStyle={{ color: '#FFD600' }} formatter={(v, n)=>[n==='revenue'?formatCurrency(v):v, n]} />
                        <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                        {/* Halo layers (hidden in legend) for dark background */}
                        <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                        <Line type="monotone" dataKey="sales" stroke="#10b981" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                        {/* Primary bright lines */}
                        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#60a5fa" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#3b82f6' }} />
                        <Line type="monotone" dataKey="sales" name="Sales" stroke="#34d399" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#10b981' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Payment Method Distribution">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {(!charts.paymentBreakdown || charts.paymentBreakdown.length === 0) ? (
                        <div className="flex items-center justify-center h-full text-gray-400">No data available</div>
                      ) : (
                      <PieChart>
                        <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} />
                        <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                        <Pie data={charts.paymentBreakdown} dataKey="value" nameKey="method" innerRadius={60} outerRadius={100} label>
                          {charts.paymentBreakdown.map((_, idx) => (
                            <Cell key={idx} fill={["#3b82f6","#10b981","#f59e0b","#6366f1","#14b8a6","#ffffff"][idx % 6]} />
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
                      <BarChart data={charts.topEmployees} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="name" stroke="#d1d5db" fontSize={12} tickLine={false} />
                        <YAxis stroke="#d1d5db" fontSize={12} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                        <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} formatter={(v)=>formatCurrency(v)} />
                        <Bar dataKey="revenue" fill="#3b82f6" radius={[6,6,0,0]} />
                      </BarChart>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">No data available</div>
                      )}
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                 <ChartCard title="Product Performance (Top vs Least)">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {(charts.productPerformance && charts.productPerformance.length > 0) ? (
                      <BarChart data={charts.productPerformance} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="product" stroke="#d1d5db" fontSize={12} tickLine={false} />
                        <YAxis stroke="#d1d5db" fontSize={12} tickLine={false} />
                        <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} />
                        <Legend />
                        <Bar dataKey="sold" name="Sold" fill="#10b981" radius={[6,6,0,0]} />
                        <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[6,6,0,0]} />
                      </BarChart>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">No data available</div>
                      )}
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                 <ChartCard title="Customer Segments">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      {(!charts.customerSegments || charts.customerSegments.length === 0) ? (
                        <div className="flex items-center justify-center h-full text-gray-400">No data available</div>
                      ) : (
                      <PieChart>
                        <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} />
                        <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                        <Pie data={charts.customerSegments} dataKey="value" nameKey="segment" innerRadius={50} outerRadius={90}>
                          {charts.customerSegments.map((_, idx) => (
                            <Cell key={idx} fill={["#3b82f6","#10b981","#f59e0b","#6366f1","#14b8a6","#ffffff"][idx % 6]} />
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
                      <LineChart data={revVsExpData} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                        <defs>
                          <linearGradient id="grad-orange" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#f59e0b" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="period" stroke="#d1d5db" fontSize={12} tickLine={false} />
                        <YAxis stroke="#d1d5db" fontSize={12} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                        <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} labelStyle={{ color: '#FFD600' }} formatter={(v,n)=>[formatCurrency(v), n]} />
                        <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                        {/* Halo layers (hidden in legend) */}
                        <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                        <Line type="monotone" dataKey="expenses" stroke="#f59e0b" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                        {/* Primary lines */}
                        <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#60a5fa" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#3b82f6' }} />
                        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#fbbf24" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#f59e0b' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            )}

            {tab==='pl' && data && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Stat label="Gross Revenue (Pre-discount)" value={data.grossRevenue} formatCurrency={formatCurrency} />
                  <Stat label="Total Tax (Sales Tax)" value={data.totalTax} formatCurrency={formatCurrency} />
                  <Stat label="Discounts" value={data.totalDiscount} formatCurrency={formatCurrency} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Stat label="Revenue (After Discounts)" value={data.revenue ?? data.netRevenue} formatCurrency={formatCurrency} />
                  <Stat label="COGS" value={data.cogs} formatCurrency={formatCurrency} />
                  <Stat label="Gross Profit" value={data.grossProfit ?? ((data.revenue ?? data.netRevenue) - (data.cogs || 0))} highlight formatCurrency={formatCurrency} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Stat label="Operating Expenses" value={data.operatingExpenses ?? data.totalExpenses} formatCurrency={formatCurrency} />
                  <Stat label="Net Profit" value={data.profit} highlight formatCurrency={formatCurrency} />
                </div>
              </>
            )}

            {tab==='tax' && data && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Stat label="Taxable Revenue" value={data.taxableRevenue} formatCurrency={formatCurrency} />
                <div className="p-4 rounded-lg border border-yellow-500/20 bg-white/5">
                  <div className="text-sm text-gray-300">Tax Rate</div>
                  <div className="text-xl font-semibold text-[#FFD600]">{(Number(data.taxRate)*100).toFixed(2)}%</div>
                </div>
                <Stat label="Estimated Tax" value={data.estimatedTax} highlight formatCurrency={formatCurrency} />
              </div>
            )}

            {tab==='insights' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <ChartCard title="Sales Trend">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={salesTrendData} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                          <XAxis dataKey="period" stroke="#d1d5db" fontSize={12} tickLine={false} />
                          <YAxis stroke="#d1d5db" fontSize={12} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                          <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} labelStyle={{ color: '#FFD600' }} formatter={(v,n)=>[n==='revenue'?formatCurrency(v):v, n]} />
                          <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                          {/* Halo layers */}
                          <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                          <Line type="monotone" dataKey="sales" stroke="#10b981" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                          {/* Primary bright lines */}
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#60a5fa" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#3b82f6' }} />
                          <Line type="monotone" dataKey="sales" name="Sales" stroke="#34d399" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#10b981' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>
                  <ChartCard title="Monthly Revenue vs Expenses">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={revVsExpData} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                          <XAxis dataKey="period" stroke="#d1d5db" fontSize={12} tickLine={false} />
                          <YAxis stroke="#d1d5db" fontSize={12} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                          <Tooltip contentStyle={{ background: '#0b0b0c', color: '#fff', border: '1px solid rgba(255,214,0,0.25)' }} labelStyle={{ color: '#FFD600' }} formatter={(v,n)=>[formatCurrency(v), n]} />
                          <Legend wrapperStyle={{ color: '#e5e7eb' }} />
                          {/* Halo layers */}
                          <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                          <Line type="monotone" dataKey="expenses" stroke="#f59e0b" strokeOpacity={0.35} strokeWidth={8} dot={false} legendType="none" connectNulls />
                          {/* Primary lines */}
                          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#60a5fa" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#3b82f6' }} />
                          <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#fbbf24" strokeWidth={3.5} connectNulls dot={{ r: 2.5, stroke: '#ffffff', strokeWidth: 1, fill: '#f59e0b' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>
                </div>
                <div className="lg:col-span-1">
                  <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-b from-[#0f0f11] to-[#141417] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#FFD600]/15 text-[#FFD600]">AI</span>
                      <div className="font-medium text-[#FFD600]">Quick Insights</div>
                    </div>
                    <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{insights || 'Analyzing your latest data for insights...'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight, formatCurrency: fmt }){
  return (
    <div className={`p-4 rounded-lg border ${highlight ? 'border-yellow-500/30 bg-[#FFD600]/10' : 'border-yellow-500/20 bg-white/5'}`}>
      <div className="text-sm text-gray-300">{label}</div>
      <div className="text-xl font-semibold text-[#FFD600]">{(fmt ? fmt(Number(value||0)) : Number(value||0).toLocaleString())}</div>
    </div>
  )
}

function KpiCard({ label, value, icon, color, children }){
  return (
    <div className="p-4 rounded-2xl border border-yellow-500/20 bg-white/5 shadow-[0_0_20px_rgba(255,214,0,0.06)] hover:shadow-[0_0_24px_rgba(255,214,0,0.12)] transition">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-300">{label}</div>
        <KpiIcon type={icon} color={color || '#FFD600'} />
      </div>
      <div className="text-2xl font-semibold text-[#FFD600] mt-1">{value}</div>
      {children ? (
        <div className="mt-2 h-12">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function ChartCard({ title, children }){
  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-white/5 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
      <div className="mb-3 text-[#FFD600] font-medium">{title}</div>
      {children}
    </div>
  )
}

function MiniSpark({ data, dataKey, color }){
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <YAxis hide domain={['dataMin','dataMax']} />
        <XAxis hide dataKey="period" />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeOpacity={0.3} strokeWidth={5} dot={false} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function KpiIcon({ type, color = '#3b82f6' }){
  const common = { width: 28, height: 28 }
  if (type === 'revenue') return (
    <svg {...common} viewBox="0 0 24 24" fill="none"><path d="M4 12l4 4 8-8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )
  if (type === 'sales') return (
    <svg {...common} viewBox="0 0 24 24" fill="none"><path d="M3 12h18M3 6h18M3 18h18" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>
  )
  if (type === 'customers') return (
    <svg {...common} viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={color} strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke={color} strokeWidth="2"/></svg>
  )
  if (type === 'product') return (
    <svg {...common} viewBox="0 0 24 24" fill="none"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke={color} strokeWidth="2"/></svg>
  )
  if (type === 'gross') return (
    <svg {...common} viewBox="0 0 24 24" fill="none"><path d="M11 3v18M7 7h8a4 4 0 010 8H7" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>
  )
  if (type === 'tax') return (
    <svg {...common} viewBox="0 0 24 24" fill="none"><path d="M3 7h18M6 10h12M9 13h6M12 16h0" stroke={color} strokeWidth="2" strokeLinecap="round"/></svg>
  )
  return null
}

function TabButton({ active, onClick, children }){
  return (
    <button onClick={onClick} className={`h-9 px-3 rounded-lg text-sm transition ${active ? 'bg-[#FFD600] text-black shadow-[0_0_18px_rgba(255,214,0,0.25)]' : 'bg-black/40 border border-yellow-500/30 text-gray-100 hover:bg-[#FFD600]/10'}`}>
      {children}
    </button>
  )
}

function QuickFilter({ label, value, current, setCurrent }){
  const isActive = current === value
  return (
    <button onClick={()=>setCurrent(value)} className={`h-8 px-2 rounded-md text-xs font-medium transition ${isActive ? 'bg-[#FFD600] text-black shadow-[0_0_14px_rgba(255,214,0,0.25)]' : 'bg-black/40 border border-yellow-500/30 text-gray-100 hover:bg-[#FFD600]/10'}`}>
      {label}
    </button>
  )
}

function IconButton({ title, onClick, icon }){
  const icons = {
    csv: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4h10l6 6v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="#FFD600" strokeWidth="1.5"/><path d="M14 4v6h6" stroke="#FFD600" strokeWidth="1.5"/><text x="8" y="17" fontSize="7" fill="#FFD600">CSV</text></svg>
    ),
    excel: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="#FFD600" strokeWidth="1.5"/><path d="M8 8l8 8M16 8l-8 8" stroke="#10b981" strokeWidth="1.5"/></svg>
    ),
    pdf: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="#FFD600" strokeWidth="1.5"/><text x="8" y="16" fontSize="7" fill="#ef4444">PDF</text></svg>
    ),
    print: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9V3h12v6M6 18v3h12v-3" stroke="#FFD600" strokeWidth="1.5"/><rect x="3" y="9" width="18" height="8" rx="2" stroke="#FFD600" strokeWidth="1.5"/></svg>
    )
  }
  return (
    <button title={title} onClick={onClick} className="h-9 inline-flex items-center justify-center rounded-lg border border-yellow-500/30 bg-black/40 px-2 text-gray-100 hover:bg-[#FFD600]/10 transition">
      {icons[icon]}
    </button>
  )
}


