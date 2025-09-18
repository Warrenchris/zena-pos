import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  ShoppingBagIcon,
  UsersIcon,
  TagIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BanknotesIcon,
  ShoppingCartIcon,
  UserGroupIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  BellIcon,
} from '@heroicons/react/24/outline'
import { fetchSalesStatistics, fetchSales } from '../store/slices/salesSlice'
import { fetchCustomers } from '../store/slices/customersSlice'
import { fetchProducts } from '../store/slices/productsSlice'
import SalesChart from '../components/SalesChart'
import api from '../services/api'
import { formatCurrency, formatDate } from '../utils/formatters'
import BusinessInsights from '../components/financial/BusinessInsights'

function StatCard({ title, value, subtitle, icon: Icon, trend, color }) {
  const isPositive = trend > 0
  const TrendIcon = isPositive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon
  
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg bg-${color}-100`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
        <TrendIcon 
          className={`w-5 h-5 ${isPositive ? 'text-green-500' : 'text-red-500'}`} 
        />
      </div>
      <h3 className="text-2xl font-semibold mb-2">{value}</h3>
      <div className="flex justify-between items-center">
        <p className="text-gray-600 text-sm">{title}</p>
        <span className={`text-sm ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{trend}%
        </span>
      </div>
      <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
    </div>
  )
}

function TransactionTable({ transactions }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold">Recent Transactions</h2>
        <button className="text-blue-600 text-sm">View All</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-500 text-sm">
              <th className="pb-4">Transaction</th>
              <th className="pb-4">Amount</th>
              <th className="pb-4">Status</th>
              <th className="pb-4">Date</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {transactions.map((transaction, index) => (
              <tr key={transaction.id} className="border-t border-gray-100">
                <td className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <ShoppingBagIcon className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium">{transaction.invoiceNumber}</p>
                      <p className="text-gray-500 text-xs">{transaction.customer}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4">{formatCurrency(transaction.total)}</td>
                <td className="py-4">
                  <span className={`px-2 py-1 rounded-full text-xs
                    ${transaction.status === 'completed' ? 'bg-green-100 text-green-600' : 
                      transaction.status === 'pending' ? 'bg-yellow-100 text-yellow-600' : 
                      'bg-red-100 text-red-600'}`}>
                    {transaction.status}
                  </span>
                </td>
                <td className="py-4 text-gray-500">{formatDate(transaction.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)
  const { sales, statistics, loading: salesLoading, error: salesError } = useSelector((state) => state.sales)
  const { customers, loading: customersLoading, error: customersError } = useSelector((state) => state.customers)
  const { products, loading: productsLoading, error: productsError } = useSelector((state) => state.products)

  const [searchQuery, setSearchQuery] = useState('')
  const [insights, setInsights] = useState([])
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [forecast, setForecast] = useState(null)

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No auth token found');
      return;
    }

    // Dispatch all data fetching actions
    Promise.all([
      dispatch(fetchSalesStatistics()),
      dispatch(fetchSales({ limit: 5 })),
      dispatch(fetchCustomers({ limit: 5 })),
      dispatch(fetchProducts({ limit: 5 }))
    ]).catch(error => {
      console.error('Error fetching dashboard data:', error);
    })
    
    // Fetch AI insights
    const fetchInsights = async () => {
      try {
        const response = await api.get('/api/insights');
        const data = response?.data || {};
        const normalized = {
          alerts: Array.isArray(data.alerts) ? data.alerts : [],
          recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
          trends: Array.isArray(data.trends) ? data.trends : [],
        };
        setInsights(normalized);
      } catch (error) {
        console.error('Error fetching insights:', error);
        setInsights({ alerts: [], recommendations: [], trends: [] });
      } finally {
        setInsightsLoading(false);
      }
    };

    fetchInsights();

    // Fetch short-term forecast from AI service (if configured)
    const fetchForecast = async () => {
      try {
        const aiUrl = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000'
        const dates = []
        const values = []
        // Simple: use last 30 days sales totals
        const end = new Date()
        for (let i=29;i>=0;i--) {
          const d = new Date(end)
          d.setDate(end.getDate()-i)
          dates.push(d.toISOString())
          // approximate: reuse statistics totalRevenue/totalSales for demo
          // In a real case, call a dedicated daily sales endpoint
          const dayValue = i===0 ? statistics?.totalRevenue || 0 : 0
          values.push(dayValue)
        }
        const resp = await fetch(`${aiUrl}/api/forecasting/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dates, values })
        })
        if (resp.ok) {
          const data = await resp.json()
          setForecast({ next: data?.predictions?.[0] || 0 })
        }
      } catch (_) {}
    }

    fetchForecast()
  }, [dispatch])

  const statsCards = [
    {
      title: 'Total Revenue',
      value: formatCurrency(statistics?.totalRevenue || 0),
      subtitle: 'vs. Ksh. 21,490 last month',
      icon: BanknotesIcon,
      trend: 12.8,
      color: 'blue'
    },
    {
      title: 'Total Orders',
      value: statistics?.totalOrders || 0,
      subtitle: 'vs. 356 last month',
      icon: ShoppingCartIcon,
      trend: 8.4,
      color: 'purple'
    },
    {
      title: 'Total Customers',
      value: statistics?.totalCustomers || 0,
      subtitle: 'vs. 1,235 last month',
      icon: UserGroupIcon,
      trend: -2.7,
      color: 'green'
    },
    {
      title: 'Average Order Value',
      value: formatCurrency(statistics?.averageOrderValue || 0),
      subtitle: 'vs. Ksh. 13,955 last month',
      icon: CalendarDaysIcon,
      trend: 4.2,
      color: 'orange'
    }
  ]

  // Combined UI flags
  const isLoading = salesLoading || customersLoading || productsLoading
  const firstError = salesError || customersError || productsError

  // Allow the user to retry failed loads from the UI
  const retryAll = () => {
    dispatch(fetchSalesStatistics())
    dispatch(fetchSales({ limit: 5 }))
    dispatch(fetchCustomers({ limit: 5 }))
    dispatch(fetchProducts({ limit: 5 }))
  }

  

  const stats = [
    {
      name: 'Total Sales',
      value: statistics.totalSales || 0,
      icon: ShoppingBagIcon,
      color: 'bg-blue-500',
      change: '+12%',
      changeType: 'positive'
    },
    {
      name: 'Total Revenue',
      value: formatCurrency(statistics.totalRevenue || 0),
      icon: CurrencyDollarIcon,
      color: 'bg-green-500',
      change: '+8%',
      changeType: 'positive'
    },
    {
      name: 'Total Customers',
      value: customers.length || 0,
      icon: UsersIcon,
      color: 'bg-purple-500',
      change: '+3%',
      changeType: 'positive'
    },
    {
      name: 'Total Products',
      value: products.length || 0,
      icon: TagIcon,
      color: 'bg-orange-500',
      change: '+2%',
      changeType: 'positive'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.name || 'User'}!
        </h1>
        <p className="text-gray-600 mt-2">
          Here's what's happening with your business today.
        </p>
      </div>

      {/* Loading & error states for the whole dashboard */}
      {isLoading && (
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-700">Loading latest data...</p>
          <div className="mt-4 h-2 w-full bg-gray-100 rounded overflow-hidden">
            <div className="h-2 bg-blue-500 animate-pulse" style={{ width: '65%' }} />
          </div>
        </div>
      )}

      {!isLoading && firstError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">We couldn't load the dashboard data.</p>
          <p className="text-red-600 text-sm mt-1">{firstError}</p>
          <button onClick={retryAll} className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
              <div className="ml-4 flex-1">
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <div className="flex items-center mt-1">
                  {stat.changeType === 'positive' ? (
                    <ArrowTrendingUpIcon className="h-4 w-4 text-green-500" />
                  ) : (
                    <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm ml-1 ${
                    stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stat.change}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">from last month</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Sales</h3>
          </div>
          <div className="p-6">
            {!sales || sales.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-500">No recent sales</p>
                <p className="text-gray-400 text-sm">Create a sale from the POS to see it here.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(Array.isArray(sales) ? sales : []).slice(0, 5).map((sale) => (
                  <div key={sale.id} className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {sale.invoiceNumber}
                      </p>
                      <p className="text-sm text-gray-500">
                        {sale.Customer?.name || 'Walk-in Customer'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(sale.total)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(sale.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Low Stock Products */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Low Stock Alert</h3>
          </div>
          <div className="p-6">
            {products.filter(p => p.stockQuantity <= p.reorderPoint).length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-500">All products are well stocked!</p>
                <p className="text-gray-400 text-sm">Update stock levels from the Products page.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {products
                  .filter(p => p.stockQuantity <= p.reorderPoint)
                  .slice(0, 5)
                  .map((product) => (
                    <div key={product.id} className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {product.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          SKU: {product.sku}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-red-600">
                          {product.stockQuantity} left
                        </p>
                        <p className="text-sm text-gray-500">
                          Reorder: {product.reorderPoint}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        </div>

      {/* AI Insights Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">AI Business Insights</h3>
          <button className="text-sm text-blue-600 hover:text-blue-800">
            View All
          </button>
        </div>
        {forecast && (
          <div className="mb-4 p-4 rounded border border-blue-200 bg-blue-50">
            <div className="text-sm text-gray-600">Forecast</div>
            <div className="text-xl font-semibold">Next period expected sales: {Number(forecast.next||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}</div>
          </div>
        )}
        {insightsLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <BusinessInsights insights={insights} />
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
            <ShoppingBagIcon className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">New Sale</p>
          </button>
          <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
            <TagIcon className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">Add Product</p>
          </button>
          <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
            <UsersIcon className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">Add Customer</p>
          </button>
          <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 text-center">
            <ChartBarIcon className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">View Reports</p>
          </button>
        </div>
      </div>
    </div>
  )
}