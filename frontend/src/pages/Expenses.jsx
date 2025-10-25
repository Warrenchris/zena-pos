import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  PlusIcon, 
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import useCurrency from '../hooks/useCurrency'

export default function Expenses() {
  const { format: formatCurrency } = useCurrency();
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-600">Track business expenses</p>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <PlusIcon className="h-5 w-5" />
          Add Expense
        </button>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-8 text-center">
          <div className="text-gray-500">
            <p>Expense management functionality coming soon!</p>
            <p className="text-sm mt-2">This will include expense tracking, categorization, and reporting.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
