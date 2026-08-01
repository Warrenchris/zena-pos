import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  PlusIcon, 
  EyeIcon,
  PrinterIcon,
  FunnelIcon,
  CalendarIcon,
  UserIcon
} from '@heroicons/react/24/outline'
import { fetchAdminSales } from '../store/slices/salesSlice'
import { fetchProducts } from '../store/slices/productsSlice'
import { fetchCustomers } from '../store/slices/customersSlice'
import { employeesAPI } from '../services/api'
import POSModal from '../components/POSModal'
import { WALK_IN_CUSTOMER_NAME } from '../constants/customer'

export default function AdminSales() {
  const dispatch = useDispatch()
  const { sales, loading, pagination } = useSelector((state) => state.sales)
  const { products } = useSelector((state) => state.products)
  const { customers } = useSelector((state) => state.customers)
  
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

  useEffect(() => {
    fetchEmployees()
    dispatch(fetchProducts())
    dispatch(fetchCustomers())
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchAdminSales({ 
      page: currentPage, 
      ...filters 
    }))
  }, [dispatch, currentPage, filters])

  const fetchEmployees = async () => {
    try {
      const response = await employeesAPI.getAll()
      if (response.data && Array.isArray(response.data)) {
        setEmployees(response.data)
      } else if (response.data && Array.isArray(response.data.employees)) {
        setEmployees(response.data.employees)
      } else if (response.data && Array.isArray(response.data.rows)) {
        setEmployees(response.data.rows)
      } else {
        setEmployees([])
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
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
    if (sale?.Employee) {
      return `${sale.Employee.firstName} ${sale.Employee.lastName}`
    }
    if (sale?.User) {
      return sale.User.name || sale.User.email || 'Unknown User'
    }
    return 'Unknown Cashier'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sales Management</h1>
          <p className="text-gray-600">View and manage all sales transactions</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
          >
            <FunnelIcon className="h-5 w-5" />
            Filters
          </button>
          <button
            onClick={() => setShowPOSModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <PlusIcon className="h-5 w-5" />
            New Sale
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-surface rounded-2xl border border-border-default shadow-floating p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                End Date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Cashier
              </label>
              <select
                value={filters.cashierId}
                onChange={(e) => setFilters({ ...filters, cashierId: e.target.value })}
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All Cashiers</option>
                {employees.map((cashier) => (
                  <option key={cashier.id} value={cashier.id}>
                    {cashier.firstName} {cashier.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Payment Status
              </label>
              <select
                value={filters.paymentStatus}
                onChange={(e) => setFilters({ ...filters, paymentStatus: e.target.value })}
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Payment Method
              </label>
              <select
                value={filters.paymentMethod}
                onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
                className="w-full rounded-lg border border-border-default bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All Methods</option>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="MOBILE">Mobile Money</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Sales Table */}
      <div className="bg-surface rounded-2xl border border-border-default shadow-floating overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-text-secondary">Loading sales...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-default">
              <thead className="bg-surface-2/60">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Cashier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-border-default">
                {(Array.isArray(sales) ? sales : []).map((sale) => (
                  <tr key={sale?.id} className="hover:bg-surface-2/60 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-text-primary">{sale?.invoiceNumber}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-text-primary">
                        {sale?.Customer?.name || sale?.customerName || WALK_IN_CUSTOMER_NAME}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-text-primary">
                        {getCashierName(sale)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-text-primary">
                        {sale?.SaleItems 
                          ? `${sale.SaleItems.length} item(s)` 
                          : sale?.products 
                            ? `${sale.products.length} item(s)` 
                            : '0 item(s)'}
                      </div>
                      <div className="text-sm text-text-muted">
                        {sale?.SaleItems 
                          ? (sale.SaleItems.map(item => item?.Product?.name).filter(Boolean).join(', ') || 'No items') 
                          : sale?.products 
                            ? (sale.products.map(item => item?.name).filter(Boolean).join(', ') || 'No items') 
                            : 'No items'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                      {formatCurrency(sale?.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(sale?.paymentStatus)}`}>
                        {sale?.paymentStatus}
                      </span>
                      <div className="text-xs text-text-muted mt-1">
                        {sale?.paymentMethod}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-text-primary">
                      {formatDate(sale?.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          className="text-primary hover:text-primary-hover"
                          title="View Details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          className="text-text-secondary hover:text-text-primary"
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
          <div className="bg-surface px-4 py-3 flex items-center justify-between border-t border-border-default sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-border-default text-sm font-medium rounded-md text-text-secondary bg-surface hover:bg-surface-2 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === pagination.totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
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
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
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
