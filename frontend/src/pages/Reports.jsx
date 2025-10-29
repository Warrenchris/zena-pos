import React, { useEffect, useMemo, useState } from 'react'
import { reportsAPI } from '../services/api'
import useCurrency from '../hooks/useCurrency'

export default function Reports() {
  const { format: formatCurrency } = useCurrency();
  const [tab, setTab] = useState('sales')
  const [range, setRange] = useState('monthly')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      setError(null)
      if (tab === 'sales') {
        const res = await reportsAPI.salesSummary({ range, startDate, endDate })
        setData(res.data)
      } else if (tab === 'pl') {
        const res = await reportsAPI.profitAndLoss({ startDate, endDate })
        setData(res.data)
      } else if (tab === 'tax') {
        const res = await reportsAPI.taxEstimate({ startDate, endDate })
        setData(res.data)
      }
    } catch (e) {
      setError(e?.response?.data?.error || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, range])

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

  return (
    <div className="space-y-4 bg-brand-black min-h-screen p-6 text-white">
      <h1 className="text-2xl font-semibold text-zana-yellow">Reports</h1>

      <div className="bg-brand-gray rounded-lg shadow-zana border border-zana-borderTint p-4 flex items-center gap-3">
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
        <button onClick={load} className="px-3 py-1.5 rounded border border-zana-borderTint text-zana-yellow hover:bg-zana-yellow/10">Apply</button>
        <button onClick={exportCsv} className="px-3 py-1.5 rounded bg-zana-yellow text-black shadow-zana hover:bg-zana-yellow/90 hover:shadow-zana-lg">Export CSV</button>
      </div>

      <div className="bg-brand-black rounded-lg shadow-zana border border-zana-borderTint p-4">
        {loading ? (
          <p className="text-white/80">Loading...</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            {tab==='sales' && Array.isArray(data) && (
              <table className="min-w-full divide-y divide-zana-borderTint">
                <thead className="bg-black">
                  <tr className="text-left text-sm">
                    <th className="px-4 py-3 text-zana-yellow border-b border-zana-borderTint">Period</th>
                    <th className="px-4 py-3 text-zana-yellow border-b border-zana-borderTint">Sales</th>
                    <th className="px-4 py-3 text-zana-yellow border-b border-zana-borderTint">Revenue</th>
                    <th className="px-4 py-3 text-zana-yellow border-b border-zana-borderTint">Tax</th>
                    <th className="px-4 py-3 text-zana-yellow border-b border-zana-borderTint">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zana-borderTint text-sm">
                  {data.map((r, i) => (
                    <tr key={i} className="odd:bg-black/30 even:bg-black/20 hover:bg-zana-yellow/5">
                      <td className="px-4 py-3 text-white">{r.period}</td>
                      <td className="px-4 py-3 text-white">{r.saleCount}</td>
                      <td className="px-4 py-3 text-zana-yellow">{formatCurrency(Number(r.revenue||0))}</td>
                      <td className="px-4 py-3 text-white">{formatCurrency(Number(r.tax||0))}</td>
                      <td className="px-4 py-3 text-white">{formatCurrency(Number(r.discount||0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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


