import { useEffect, useMemo, useState } from 'react'
import { reportsAPI } from '../services/api'

export default function Reports() {
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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>

      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
        <div className="space-x-2">
          <button onClick={() => setTab('sales')} className={`px-3 py-1.5 rounded ${tab==='sales'?'bg-blue-600 text-white':'border border-gray-300'}`}>Sales Summary</button>
          <button onClick={() => setTab('pl')} className={`px-3 py-1.5 rounded ${tab==='pl'?'bg-blue-600 text-white':'border border-gray-300'}`}>Profit & Loss</button>
          <button onClick={() => setTab('tax')} className={`px-3 py-1.5 rounded ${tab==='tax'?'bg-blue-600 text-white':'border border-gray-300'}`}>Tax Estimate</button>
        </div>
        <div className="flex-1" />
        {tab==='sales' && (
          <select value={range} onChange={(e)=>setRange(e.target.value)} className="border border-gray-300 rounded px-2 py-1 bg-white">
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
        )}
        <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} className="border border-gray-300 rounded px-2 py-1" />
        <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)} className="border border-gray-300 rounded px-2 py-1" />
        <button onClick={load} className="px-3 py-1.5 rounded border border-gray-300">Apply</button>
        <button onClick={exportCsv} className="px-3 py-1.5 rounded bg-green-600 text-white">Export CSV</button>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        {loading ? (
          <p>Loading...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            {tab==='sales' && Array.isArray(data) && (
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-600 text-sm">
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Sales</th>
                    <th className="px-4 py-3">Revenue</th>
                    <th className="px-4 py-3">Tax</th>
                    <th className="px-4 py-3">Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {data.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">{r.period}</td>
                      <td className="px-4 py-3">{r.saleCount}</td>
                      <td className="px-4 py-3">{Number(r.revenue||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
                      <td className="px-4 py-3">{Number(r.tax||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
                      <td className="px-4 py-3">{Number(r.discount||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}</td>
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
                <div className="p-4 rounded border border-gray-200">
                  <div className="text-sm text-gray-600">Tax Rate</div>
                  <div className="text-xl font-semibold">{(Number(data.taxRate)*100).toFixed(2)}%</div>
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
    <div className={`p-4 rounded border ${highlight ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-xl font-semibold">{Number(value||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>
    </div>
  )
}


