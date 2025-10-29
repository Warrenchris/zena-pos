import { useEffect, useState } from 'react'
import { expensesAPI } from '../../services/api'
import { toast } from '../../utils/toast'

const categories = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'salary', label: 'Salaries' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
]

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'M-Pesa / Mobile Money' },
  { value: 'other', label: 'Other' },
]

export default function ExpenseFormModal({ open, onClose, onSaved, editing }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: '',
    category: 'other',
    paymentMethod: 'cash',
    reference: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (editing) {
      setForm({
        description: editing.description || '',
        amount: editing.amount || '',
        date: editing.date ? editing.date.substring(0, 10) : '',
        category: editing.category || 'other',
        paymentMethod: editing.paymentMethod || 'cash',
        reference: editing.reference || '',
        notes: editing.notes || '',
      })
    } else {
      setForm({ 
        description: '', 
        amount: '', 
        date: new Date().toISOString().split('T')[0], 
        category: 'other', 
        paymentMethod: 'cash', 
        reference: '', 
        notes: '' 
      })
    }
  }, [editing])

  if (!open) return null

  const onChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const validate = () => {
    const errs = {}
    if (!form.description?.trim()) errs.description = 'Description is required'
    if (!form.amount || Number(form.amount) <= 0) errs.amount = 'Amount must be greater than 0'
    if (!form.category) errs.category = 'Category is required'
    if (!form.paymentMethod) errs.paymentMethod = 'Payment method is required'
    if (!form.date) errs.date = 'Date is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      if (editing) {
        await expensesAPI.update(editing.id, form)
        toast.success('Expense updated successfully!')
      } else {
        await expensesAPI.create(form)
        toast.success('Expense added successfully!')
      }
      onSaved?.()
    } catch (err) {
      toast.error('Failed to save expense')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-black border border-yellow-600/30 rounded-lg w-full max-w-lg mx-4 p-4">
        <h3 className="text-xl font-semibold text-yellow-400 mb-3">{editing ? 'Edit Expense' : 'Add Expense'}</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => onChange('description', e.target.value)}
              className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => onChange('amount', e.target.value)}
                className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
              {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Date</label>
              <div className="relative">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => onChange('date', e.target.value)}
                  required
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500 cursor-pointer"
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-5 w-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => onChange('category', e.target.value)}
                className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {errors.category && <p className="text-red-400 text-xs mt-1">{errors.category}</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Payment Method</label>
              <select
                value={form.paymentMethod}
                onChange={(e) => onChange('paymentMethod', e.target.value)}
                className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                {paymentMethods.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {errors.paymentMethod && <p className="text-red-400 text-xs mt-1">{errors.paymentMethod}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Reference (optional)</label>
              <input
                type="text"
                value={form.reference}
                onChange={(e) => onChange('reference', e.target.value)}
                className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => onChange('notes', e.target.value)}
                className="w-full bg-black text-white border border-yellow-600/30 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-yellow-600/30 text-gray-200">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-md bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60"
            >
              {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


