import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  PlusIcon, 
  EyeIcon,
  PrinterIcon,
  FunnelIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'
import { fetchAdminSales, fetchMySales } from '../store/slices/salesSlice'
import { fetchProducts } from '../store/slices/productsSlice'
import { fetchCustomers } from '../store/slices/customersSlice'
import { employeesAPI } from '../services/api'
import POSModal from '../components/POSModal'
import { useCurrency } from '../hooks/useCurrency'

export default function Sales() {
  const dispatch = useDispatch()
  const { sales, loading, pagination } = useSelector((state) => state.sales)
  const { products } = useSelector((state) => state.products)
  const { customers } = useSelector((state) => state.customers)
  const { user } = useSelector((state) => state.auth)
  const { format: formatCurrency } = useCurrency()
  
  const [currentPage, setCurrentPage] = useState(1)
  const [showPOSModal, setShowPOSModal] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [employees, setEmployees] = useState([])
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    cashierId: '',
    sortBy: 'createdAt',
    sortOrder: 'DESC'
  })

  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  useEffect(() => {
    if (isAdmin) {
      fetchEmployees()
    }
    dispatch(fetchProducts())
    dispatch(fetchCustomers())
  }, [dispatch, isAdmin])

  useEffect(() => {
    if (isAdmin) {
      dispatch(fetchAdminSales({ 
        page: currentPage, 
        ...filters 
      }))
    } else {
      dispatch(fetchMySales({ 
        page: currentPage, 
        startDate: filters.startDate,
        endDate: filters.endDate,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      }))
    }
  }, [dispatch, currentPage, filters, isAdmin])

  const fetchEmployees = async () => {
    try {
      const response = await employeesAPI.getAll()
      setEmployees(response.data)
    } catch (error) {
      console.error('Error fetching employees:', error)
    }
  }


  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
    setCurrentPage(1) // Reset to first page when filters change
  }

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      cashierId: '',
      sortBy: 'createdAt',
      sortOrder: 'DESC'
    })
    setCurrentPage(1)
  }

  const getCashierName = (sale) => {
    if (sale.Employee) {
      return `${sale.Employee.firstName} ${sale.Employee.lastName}`
    }
    return 'Unknown Cashier'
  }

  return (
    <div className="space-y-6 bg-brand-black text-white min-h-screen p-6 rounded-lg">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-zana-yellow">
            {isAdmin ? 'Sales Management' : 'My Sales'}
          </h1>
          <p className="text-white/70">
            {isAdmin ? 'View and manage all sales transactions' : 'View your sales transactions'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 rounded-lg flex items-center gap-2 border border-zana-borderTint text-zana-yellow bg-transparent hover:bg-zana-yellow/10 focus:outline-none focus:ring-2 focus:ring-zana-yellow/40"
          >
            <FunnelIcon className="h-5 w-5" />
            Filters
          </button>
          <button
            onClick={() => setShowPOSModal(true)}
            className="px-4 py-2 rounded-lg flex items-center gap-2 bg-zana-yellow text-black shadow-zana hover:bg-zana-yellow/90 hover:shadow-zana-lg focus:outline-none focus:ring-2 focus:ring-zana-yellow/50"
          >
            <PlusIcon className="h-5 w-5" />
            New Sale
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-brand-gray rounded-lg shadow-zana p-6 border border-zana-borderTint">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-zana-yellow mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-black/40 text-white placeholder:text-zana-yellow/40 border border-zana-borderTint focus:outline-none focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zana-yellow mb-1">
                End Date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-black/40 text-white placeholder:text-zana-yellow/40 border border-zana-borderTint focus:outline-none focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow"
              />
            </div>
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-zana-yellow mb-1">
                  Cashier
                </label>
                <select
                  value={filters.cashierId}
                  onChange={(e) => handleFilterChange('cashierId', e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-black/40 text-white border border-zana-borderTint focus:outline-none focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow"
                >
                  <option value="">All Cashiers</option>
                  {employees.map(employee => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-zana-yellow mb-1">
                Sort By
              </label>
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-black/40 text-white border border-zana-borderTint focus:outline-none focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow"
              >
                <option value="createdAt">Date</option>
                <option value="total">Total</option>
                <option value="invoiceNumber">Invoice</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zana-yellow mb-1">
                Order
              </label>
              <select
                value={filters.sortOrder}
                onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-black/40 text-white border border-zana-borderTint focus:outline-none focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow"
              >
                <option value="DESC">Descending</option>
                <option value="ASC">Ascending</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-zana-yellow hover:text-zana-yellow/80"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {/* Sales Table */}
      <div className="bg-brand-black rounded-lg shadow-zana overflow-hidden border border-zana-borderTint">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zana-yellow mx-auto"></div>
            <p className="mt-2 text-white/70">Loading sales...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zana-borderTint">
              <thead className="bg-black">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                    Customer
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                      Cashier
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zana-borderTint">
                {sales.map((sale) => (
                  <tr key={sale.id} className="odd:bg-black/30 even:bg-black/20 hover:bg-zana-yellow/5">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">{sale.invoiceNumber}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {sale.Customer?.name || sale.customerName || 'Walk-in Customer'}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-white">
                          {getCashierName(sale)}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {sale.SaleItems?.length || 0} item(s)
                      </div>
                      <div className="text-sm text-white/60">
                        {sale.SaleItems?.map(item => item.Product?.name).join(', ') || 'No items'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {formatCurrency(sale.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPaymentStatusColor(sale.paymentStatus)}`}>
                        {sale.paymentStatus}
                      </span>
                      <div className="text-xs text-white/60 mt-1">
                        {sale.paymentMethod}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {formatDate(sale.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          className="text-zana-yellow hover:text-zana-yellow/80 hover:drop-shadow-[0_0_6px_rgba(255,214,0,0.6)]"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          className="text-white/80 hover:text-white"
                          title="Print Receipt"
                        >
                          <PrinterIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-black/30 px-4 py-3 flex items-center justify-between border-t border-zana-borderTint sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md text-white border-zana-borderTint bg-black hover:bg-zana-yellow/10 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === pagination.totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md text-white border-zana-borderTint bg-black hover:bg-zana-yellow/10 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-white/80">
                  Showing page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{pagination.totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        page === currentPage
                          ? 'z-10 bg-zana-yellow text-black border-zana-yellow'
                          : 'bg-black text-white/70 border-zana-borderTint hover:bg-zana-yellow/10'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* POS Modal */}
      {showPOSModal && (
        <POSModal
          products={products}
          customers={customers}
          onClose={() => setShowPOSModal(false)}
        />
      )}
    </div>
  )
}
