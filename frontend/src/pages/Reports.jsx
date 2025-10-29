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

export default function Reports() {
  const { format: formatCurrency } = useCurrency();
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const { categories = [] } = useSelector((state) => state.categories || { categories: [] })
  const [tab, setTab] = useState('sales')
  const [range, setRange] = useState('monthly')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
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
  const cacheRef = useRef(new Map())
  const debounceRef = useRef(null)

  // Load data when component mounts
  useEffect(() => {
    load()
  }, [])

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

      if (tab === 'sales') {
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
        setCharts({
          salesTrend: res.data?.salesTrend || [],
          paymentBreakdown: res.data?.paymentBreakdown || [],
          topEmployees: res.data?.topEmployees || [],
          productPerformance: res.data?.productPerformance || [],
          customerSegments: res.data?.customerSegments || [],
        })
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
    <div className="space-y-6 bg-brand-black min-h-screen p-6 text-white">
      <h1 className="text-2xl font-semibold text-zana-yellow">Reports</h1>

      {/* Filters */}
      <div className="bg-brand-gray rounded-lg shadow-zana border border-zana-borderTint p-4 flex flex-wrap gap-3 items-end">
        <div className="space-x-2">
          <button onClick={() => setTab('sales')} className={`px-3 py-1.5 rounded border ${tab==='sales'?'bg-zana-yellow text-black border-zana-yellow':'border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10'}`}>Sales Summary</button>
          <button onClick={() => setTab('pl')} className={`px-3 py-1.5 rounded border ${tab==='pl'?'bg-zana-yellow text-black border-zana-yellow':'border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10'}`}>Profit & Loss</button>
          <button onClick={() => setTab('tax')} className={`px-3 py-1.5 rounded border ${tab==='tax'?'bg-zana-yellow text-black border-zana-yellow':'border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10'}`}>Tax Estimate</button>
        </div>
        <div className="flex-1" />
        {tab==='sales' && (
          <select value={range} onChange={(e)=>setRange(e.target.value)} className="border border-zana-borderTint rounded px-2 py-1 bg-black/40 text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow">
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
        )}
        <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="border border-zana-borderTint rounded px-2 py-1 bg-black/40 text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow" />
        <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="border border-zana-borderTint rounded px-2 py-1 bg-black/40 text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow" />
        <select value={cashierId} onChange={(e)=>setCashierId(e.target.value)} className="border border-zana-borderTint rounded px-2 py-1 bg-black/40 text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow">
          <option value="">All Cashiers</option>
          {cashiers.map(c => (
            <option key={c.id} value={c.id}>{`${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email || c.id}</option>
          ))}
        </select>
        <select value={categoryId} onChange={(e)=>setCategoryId(e.target.value)} className="border border-zana-borderTint rounded px-2 py-1 bg-black/40 text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow">
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <button onClick={load} className="px-3 py-1.5 rounded border border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10">Apply</button>
        <button onClick={handleRefresh} className="px-3 py-1.5 rounded bg-zana-yellow text-black shadow-zana hover:bg-zana-yellow/90 hover:shadow-zana-lg">Refresh</button>
        <button onClick={exportCsv} className="px-3 py-1.5 rounded border border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10">Export CSV</button>
        <button onClick={exportExcel} className="px-3 py-1.5 rounded border border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10">Export Excel</button>
        <button onClick={exportPdf} className="px-3 py-1.5 rounded border border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10">Export PDF</button>
        <button onClick={printReport} className="px-3 py-1.5 rounded border border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10">Print</button>
      </div>

      {/* KPI Cards */}
      {tab==='sales' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Revenue" value={formatCurrency(kpis.revenue)} />
          <KpiCard label="Total Sales" value={kpis.sales} />
          <KpiCard label="Active Customers" value={kpis.activeCustomers} />
          <KpiCard label="Top Product" value={kpis.topProduct} />
        </div>
      )}

      <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint p-4">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <p className="text-white/80 text-lg">Loading reports...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-8">
            <p className="text-red-500 text-lg mb-2">{error}</p>
            <button onClick={load} className="px-3 py-1.5 rounded bg-zana-yellow text-black shadow-zana hover:bg-zana-yellow/90">
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
                      <LineChart data={charts.salesTrend} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,214,0,0.1)" />
                        <XAxis dataKey="period" stroke="#e5e7eb" fontSize={12} tickLine={false} />
                        <YAxis stroke="#e5e7eb" fontSize={12} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                        <Tooltip contentStyle={{ background: '#0b0b0c', border: '1px solid rgba(255,214,0,0.2)' }} labelStyle={{ color: '#FFD600' }} formatter={(v)=>[formatCurrency(v),'Revenue']} />
                        <Legend />
                        <Line type="monotone" dataKey="revenue" stroke="#FFD600" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="sales" stroke="#FFE166" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Payment Method Breakdown">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip contentStyle={{ background: '#0b0b0c', border: '1px solid rgba(255,214,0,0.2)' }} />
                        <Legend />
                        <Pie data={charts.paymentBreakdown} dataKey="value" nameKey="method" outerRadius={100} label>
                          {charts.paymentBreakdown.map((_, idx) => (
                            <Cell key={idx} fill={["#FFD600","#FFE166","#E6C200","#8884d8","#82ca9d"][idx % 5]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Top Employees by Sales">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.topEmployees} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,214,0,0.1)" />
                        <XAxis dataKey="name" stroke="#e5e7eb" fontSize={12} tickLine={false} />
                        <YAxis stroke="#e5e7eb" fontSize={12} tickLine={false} tickFormatter={(v)=>formatCurrency(v)} />
                        <Tooltip contentStyle={{ background: '#0b0b0c', border: '1px solid rgba(255,214,0,0.2)' }} formatter={(v)=>formatCurrency(v)} />
                        <Bar dataKey="revenue" fill="#FFD600" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Product Performance (Top vs Least)">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.productPerformance} margin={{ top: 5, right: 24, left: 8, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,214,0,0.1)" />
                        <XAxis dataKey="product" stroke="#e5e7eb" fontSize={12} tickLine={false} />
                        <YAxis stroke="#e5e7eb" fontSize={12} tickLine={false} />
                        <Tooltip contentStyle={{ background: '#0b0b0c', border: '1px solid rgba(255,214,0,0.2)' }} />
                        <Legend />
                        <Bar dataKey="sold" name="Sold" fill="#FFD600" radius={[6,6,0,0]} />
                        <Bar dataKey="revenue" name="Revenue" fill="#FFE166" radius={[6,6,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard title="Customer Segments">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip contentStyle={{ background: '#0b0b0c', border: '1px solid rgba(255,214,0,0.2)' }} />
                        <Legend />
                        <Pie data={charts.customerSegments} dataKey="value" nameKey="segment" innerRadius={50} outerRadius={90}>
                          {charts.customerSegments.map((_, idx) => (
                            <Cell key={idx} fill={["#FFD600","#FFE166","#E6C200","#8884d8","#82ca9d"][idx % 5]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            )}

            {tab==='pl' && data && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Stat label="Gross Revenue" value={data.grossRevenue} />
                <Stat label="Total Tax" value={data.totalTax} />
                <Stat label="Discounts" value={data.totalDiscount} />
                <Stat label="Net Revenue" value={data.netRevenue} />
                <Stat label="Expenses" value={data.totalExpenses} />
                <Stat label="Profit" value={data.profit} highlight />
              </div>
            )}

            {tab==='tax' && data && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Stat label="Taxable Revenue" value={data.taxableRevenue} />
                <div className="p-4 rounded border border-zana-borderTint bg-black/40">
                  <div className="text-sm text-white/70">Tax Rate</div>
                  <div className="text-xl font-semibold text-white">{(Number(data.taxRate)*100).toFixed(2)}%</div>
                </div>
                <Stat label="Estimated Tax" value={data.estimatedTax} highlight />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }){
  return (
    <div className={`p-4 rounded border ${highlight ? 'border-zana-borderTint bg-zana-yellow/10' : 'border-zana-borderTint bg-black/40'}`}>
      <div className="text-sm text-white/70">{label}</div>
      <div className="text-xl font-semibold text-zana-yellow">{formatCurrency(Number(value||0))}</div>
    </div>
  )
}

function KpiCard({ label, value }){
  return (
    <div className="p-4 rounded-lg border border-zana-borderTint bg-black/40 shadow-zana">
      <div className="text-sm text-white/70">{label}</div>
      <div className="text-2xl font-semibold text-zana-yellow mt-1">{value}</div>
    </div>
  )
}

function ChartCard({ title, children }){
  return (
    <div className="rounded-lg border border-zana-borderTint bg-black/40 p-4">
      <div className="mb-3 text-zana-yellow font-medium">{title}</div>
      {children}
    </div>
  )
}


