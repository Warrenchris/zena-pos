import { useState } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { 
  HomeIcon, 
  ShoppingBagIcon, 
  UsersIcon, 
  TagIcon, 
  CurrencyDollarIcon,
  ChartBarIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { logout } from '../store/slices/authSlice'
import Header from './dashboard/Header'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector((state) => state.auth)

  const adminNavigation = user?.role === 'admin' ? [
    {
      name: 'Employees',
      href: '/admin/employees',
      icon: UserGroupIcon,
      badge: '',
      description: 'Staff Management'
    },
  ] : [];

  const navigation = [
    { 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: HomeIcon,
      badge: '',
      description: 'Overview & Analytics'
    },
    { 
      name: 'Sales', 
      href: '/sales', 
      icon: ShoppingBagIcon,
      badge: '12',
      description: 'Transactions & Orders'
    },
    { 
      name: 'Products', 
      href: '/products', 
      icon: TagIcon,
      badge: '34',
      description: 'Inventory & Items'
    },
    { 
      name: 'Customers', 
      href: '/customers', 
      icon: UsersIcon,
      badge: '',
      description: 'Client Management'
    },
    {
      name: 'Expenses',
      href: '/expenses',
      icon: CurrencyDollarIcon,
      badge: '',
      description: 'Costs & Payments'
    },
    {
      name: 'Categories',
      href: '/categories',
      icon: ChartBarIcon,
      badge: '',
      description: 'Product Groups'
    }
    ,
    {
      name: 'Reports',
      href: '/reports',
      icon: ChartBarIcon,
      badge: '',
      description: 'Sales, P&L, Tax'
    }
  ]

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  const renderNavLink = (item) => (
    <Link
      key={item.name}
      to={item.href}
      className={`${
        location.pathname === item.href
          ? 'bg-blue-50 text-blue-600'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      } group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200`}
    >
      <item.icon
        className={`${
          location.pathname === item.href
            ? 'text-blue-600'
            : 'text-gray-400 group-hover:text-gray-600'
        } mr-3 flex-shrink-0 h-5 w-5`}
      />
      <div className="flex-1">
        <p>{item.name}</p>
        <p className="text-xs text-gray-500 font-normal mt-0.5">{item.description}</p>
      </div>
      {item.badge && (
        <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {item.badge}
        </span>
      )}
    </Link>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-40 w-64 bg-white transform transition-transform duration-300 ease-in-out lg:hidden`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center">
            <img className="h-8 w-auto" src="/vite.svg" alt="Logo" />
            <span className="ml-3 text-xl font-semibold">Zana POS</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-gray-500 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-5 px-4 space-y-2">
          {navigation.map(renderNavLink)}
          
          {user?.role === 'admin' && adminNavigation.length > 0 && (
            <>
              <div className="mt-8 mb-4 px-4">
                <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Admin
                </h3>
              </div>
              {adminNavigation.map(renderNavLink)}
            </>
          )}
        </nav>

        <div className="absolute bottom-0 w-full border-t border-gray-200 p-4">
          <button
            onClick={handleLogout}
            className="group flex items-center px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 w-full"
          >
            <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
            Sign out
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
          <div className="flex h-16 items-center px-6 border-b border-gray-200">
            <img className="h-8 w-auto" src="/vite.svg" alt="Logo" />
            <span className="ml-3 text-xl font-semibold">Zana POS</span>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto">
            <nav className="flex-1 px-4 space-y-2 py-4">
              {navigation.map(renderNavLink)}

              {user?.role === 'admin' && adminNavigation.length > 0 && (
                <>
                  <div className="mt-8 mb-4 px-2">
                    <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Admin
                    </h3>
                  </div>
                  {adminNavigation.map(renderNavLink)}
                </>
              )}
            </nav>
          </div>

          <div className="border-t border-gray-200 p-4">
            <button
              onClick={handleLogout}
              className="group flex items-center px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-50 w-full"
            >
              <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Header with search and profile */}
        <Header onMobileMenuClick={() => setSidebarOpen(true)} />

        {/* Main content */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}