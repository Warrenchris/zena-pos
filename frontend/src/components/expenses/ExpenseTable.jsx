import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import useCurrency from '../../hooks/useCurrency'

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-4 bg-gray-800 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-800 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-800 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-800 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-800 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-800 rounded" /></td>
      <td className="px-4 py-3"><div className="h-4 bg-gray-800 rounded" /></td>
    </tr>
  )
}

export default function ExpenseTable({
  loading,
  error,
  expenses,
  page,
  limit,
  total,
  sortField,
  sortDirection,
  onSortChange,
  onPageChange,
  onLimitChange,
  onEdit,
  onDelete,
  canManage,
  formatCurrency,
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 10)))
  const sorted = (expenses || []).slice().sort((a, b) => {
    const dir = sortDirection === 'asc' ? 1 : -1
    const get = (obj) => {
      switch (sortField) {
        case 'description': return (obj.description || '').toLowerCase()
        case 'category': return (obj.category || '').toLowerCase()
        case 'amount': return Number(obj.amount || 0)
        case 'date': return obj.date ? new Date(obj.date).getTime() : 0
        case 'paymentMethod': return (obj.paymentMethod || '').toLowerCase()
        case 'addedBy': return ((obj.recordedBy?.name || obj.user?.name || '')).toLowerCase()
        default: return obj.id || 0
      }
    }
    const va = get(a)
    const vb = get(b)
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })

  const SortHeader = ({ field, children, alignRight }) => {
    const isActiveSort = sortField === field;
    const ariaSortValue = isActiveSort ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

    return (
      <th
        scope="col"
        aria-sort={ariaSortValue}
        className={`px-4 py-3 text-left text-xs font-semibold ${alignRight ? 'text-right' : ''}`}
      >
        <button
          onClick={() => onSortChange(field)}
          className="inline-flex items-center gap-1 text-yellow-400 hover:underline focus:outline-none focus:ring-2 focus:ring-yellow-300/40 rounded"
        >
          <span>{children}</span>
          {sortField === field && (
            <span className="text-[10px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>
          )}
        </button>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto border border-yellow-600/20 rounded-lg">
      <table className="responsive-table bg-black text-gray-200">
        <thead className="bg-yellow-500/10 text-yellow-400">
          <tr>
            <SortHeader field="description">Description</SortHeader>
            <SortHeader field="category">Category</SortHeader>
            <SortHeader field="amount">Amount</SortHeader>
            <SortHeader field="date">Date</SortHeader>
            <SortHeader field="paymentMethod">Payment</SortHeader>
            <SortHeader field="addedBy">Added By</SortHeader>
            {canManage && <SortHeader field="actions" alignRight>Actions</SortHeader>}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}

          {!loading && sorted?.length === 0 && (
            <tr>
              <td colSpan={canManage ? 7 : 6} className="px-4 py-6 text-center text-gray-400">
                No expenses recorded yet — add your first one to start tracking.
              </td>
            </tr>
          )}

          {!loading && sorted?.map((e) => (
            <tr key={e.id} className="border-t border-yellow-600/10 hover:bg-yellow-500/5 transition-colors duration-200">
              <td className="px-4 py-3" data-label="Description">{e.description}</td>
              <td className="px-4 py-3 capitalize" data-label="Category">{e.category?.replace('_', ' ')}</td>
              <td className="px-4 py-3 text-yellow-300 font-semibold" data-label="Amount">{formatCurrency ? formatCurrency(e.amount) : e.amount}</td>
              <td className="px-4 py-3" data-label="Date">{e.date ? new Date(e.date).toLocaleDateString() : '-'}</td>
              <td className="px-4 py-3 capitalize" data-label="Payment">{e.paymentMethod?.replace('_', ' ')}</td>
              <td className="px-4 py-3" data-label="Added By">{e.recordedBy?.name || e.user?.name || '—'}</td>
              {canManage && (
                <td className="px-4 py-3" data-label="Actions">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onEdit(e)}
                      className="touch-target flex items-center justify-center px-2 py-1 rounded-md border border-yellow-600/30 text-yellow-300 hover:bg-yellow-600/10 focus:outline-none focus:ring-2 focus:ring-yellow-300/40 focus:ring-offset-2 focus:ring-offset-black"
                      aria-label={`Edit expense ${e.description}`}
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(e)}
                      className="touch-target flex items-center justify-center px-2 py-1 rounded-md border border-red-600/30 text-red-400 hover:bg-red-600/10 focus:outline-none focus:ring-2 focus:ring-red-400/40 focus:ring-offset-2 focus:ring-offset-black"
                      aria-label={`Delete expense ${e.description}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3">
        <div className="text-sm text-gray-400">Page {page} of {totalPages} • {total} total</div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => onLimitChange(parseInt(e.target.value))}
            className="bg-black text-gray-200 border border-yellow-600/30 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
            aria-label="Items per page"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded-md border border-yellow-600/30 text-gray-200 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
            >
              Prev
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded-md border border-yellow-600/30 text-gray-200 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-yellow-300/40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


