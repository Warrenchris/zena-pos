import { useState, useEffect } from 'react'

const categories = [
  { value: '', label: 'All Categories' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'salary', label: 'Salaries' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
]

const paymentMethods = [
  { value: '', label: 'All Methods' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'M-Pesa / Mobile Money' },
  { value: 'other', label: 'Other' },
]

export default function ExpenseFilters({ value, onChange, onReset }) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  const update = (field, v) => {
    const next = { ...local, [field]: v }
    setLocal(next)
    onChange(next)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Start Date</label>
        <input
          type="date"
          value={local.startDate}
          onChange={(e) => update('startDate', e.target.value)}
          className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">End Date</label>
        <input
          type="date"
          value={local.endDate}
          onChange={(e) => update('endDate', e.target.value)}
          className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Category</label>
        <select
          value={local.category}
          onChange={(e) => update('category', e.target.value)}
          className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Payment Method</label>
        <select
          value={local.paymentMethod}
          onChange={(e) => update('paymentMethod', e.target.value)}
          className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          {paymentMethods.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onReset}
          className="px-3 py-2 rounded-md border border-yellow-600/30 text-gray-300 hover:bg-yellow-600/10"
        >
          Reset
        </button>
      </div>
    </div>
  )
}


