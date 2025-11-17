import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useSelector } from 'react-redux'
import Layout from './components/Layout'
import PrivateRoute from './components/PrivateRoute'
import LoadingSpinner from './components/LoadingSpinner'
import ErrorBoundary from './components/ErrorBoundary'
import RouteError from './components/RouteError'

// Custom lazy loading with error handling
const lazyLoad = (importFunc) => {
  return lazy(() => 
    importFunc().catch(error => {
      console.error('Error loading module:', error);
      return { default: () => <div>Error loading page. Please try refreshing.</div> };
    })
  );
};

// Lazy load components with error handling
const Login = lazyLoad(() => import('./pages/Login'))
const Signup = lazyLoad(() => import('./pages/Signup'))
const Dashboard = lazyLoad(() => import('./pages/Dashboard'))
const CashierDashboard = lazyLoad(() => import('./pages/CashierDashboard'))
const Products = lazyLoad(() => import('./pages/Products'))
const Categories = lazyLoad(() => import('./pages/Categories'))
const Customers = lazyLoad(() => import('./pages/Customers'))
const Sales = lazyLoad(() => import('./pages/Sales'))
const Expenses = lazyLoad(() => import('./pages/Expenses'))
const Users = lazyLoad(() => import('./pages/Users'))
const CompanySettings = lazyLoad(() => import('./pages/CompanySettings'))
const Employees = lazyLoad(() => import('./pages/Employees'))
const Reports = lazyLoad(() => import('./pages/Reports'))
const MySales = lazyLoad(() => import('./pages/MySales'))
const CreateProduct = lazyLoad(() => import('./pages/CreateProduct'))
const Brands = lazyLoad(() => import('./pages/Brands'))
const Units = lazyLoad(() => import('./pages/Units'))
const SubCategories = lazyLoad(() => import('./pages/SubCategories'))
const Settings = lazyLoad(() => import('./pages/Settings'))

const AiServices = lazy(() => import('./pages/AiServices'))

// Placeholder components for new sidebar items
const PlaceholderPage = lazy(() => import('./components/PlaceholderPage'))

export default function AppRoutes() {
  const { token, user } = useSelector((state) => state.auth)
  const location = useLocation()

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 AppRoutes Debug:');
    console.log('Current location:', location.pathname);
    console.log('Token exists:', !!token);
    console.log('User role:', user?.role);
    console.log('Routes registered:', [
      '/dashboard', '/products', '/categories', '/customers', '/employees', 
      '/sales', '/expenses', '/reports', '/admin/users', '/admin/employees'
    ]);
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
        <Route path="/login" element={
          token && user ? <Navigate to="/dashboard" replace /> : <Login />
        } />
        <Route path="/signup" element={
          token && user ? <Navigate to="/dashboard" replace /> : <Signup />
        } />
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route path="/dashboard" element={
            token ? (
              (user?.role === 'admin') ? <Dashboard /> : <CashierDashboard />
            ) : <Navigate to="/login" replace />
          } />
          <Route path="/products" element={<Products />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/employees" element={<Employees />} />
          {/* Test route */}
          <Route path="/test-employees" element={<Employees />} />
          {/* Debug route */}
          <Route path="/debug-routes" element={<div>Routes are working!</div>} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/my-sales" element={<MySales />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/employees" element={<Employees />} />
          <Route path="/admin/company" element={<CompanySettings />} />
          {/* Settings are now handled by the /settings route */}
          <Route path="/reports" element={<Reports />} />
          <Route path="/admin/ai" element={<AiServices />} />
          
          {/* Super Admin Routes */}
          <Route path="/super-admin" element={<PlaceholderPage />} />
          <Route path="/applications" element={<PlaceholderPage />} />
          <Route path="/layouts" element={<PlaceholderPage />} />
          
          {/* Inventory Routes */}
          <Route path="/products/create" element={<CreateProduct />} />
          <Route path="/products/expired" element={<PlaceholderPage />} />
          <Route path="/products/low-stock" element={<PlaceholderPage />} />
          <Route path="/categories/sub" element={<SubCategories />} />
          <Route path="/brands" element={<Brands />} />
          <Route path="/units" element={<Units />} />
          <Route path="/variants" element={<PlaceholderPage />} />
          <Route path="/warranties" element={<PlaceholderPage />} />
          <Route path="/print/barcode" element={<PlaceholderPage />} />
          <Route path="/print/qr" element={<PlaceholderPage />} />
          
          {/* Stock Routes */}
          <Route path="/stock/manage" element={<PlaceholderPage />} />
          <Route path="/stock/adjustment" element={<PlaceholderPage />} />
          <Route path="/stock/transfer" element={<PlaceholderPage />} />
          
          {/* Sales Routes */}
          <Route path="/invoices" element={<PlaceholderPage />} />
          <Route path="/sales/returns" element={<PlaceholderPage />} />
          <Route path="/quotations" element={<PlaceholderPage />} />
          <Route path="/pos" element={<PlaceholderPage />} />
          
          {/* Promo Routes */}
          <Route path="/coupons" element={<PlaceholderPage />} />
          <Route path="/gift-cards" element={<PlaceholderPage />} />
          <Route path="/discounts" element={<PlaceholderPage />} />
          
          {/* Purchases Routes */}
          <Route path="/purchases" element={<PlaceholderPage />} />
          <Route path="/purchase-orders" element={<PlaceholderPage />} />
          <Route path="/purchase-returns" element={<PlaceholderPage />} />
          
          <Route index element={<Navigate to="/dashboard" replace />} />
          
          {/* Catch-all route for unmatched paths */}
          <Route path="*" element={<RouteError />} />
        </Route>
      </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}