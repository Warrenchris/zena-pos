import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useSelector } from 'react-redux'
import Layout from './components/Layout'
import PrivateRoute from './components/PrivateRoute'

// Lazy load components
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CashierDashboard = lazy(() => import('./pages/CashierDashboard'))
const Products = lazy(() => import('./pages/Products'))
const Categories = lazy(() => import('./pages/Categories'))
const Customers = lazy(() => import('./pages/Customers'))
const Sales = lazy(() => import('./pages/Sales'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Users = lazy(() => import('./pages/Users'))
const CompanySettings = lazy(() => import('./pages/CompanySettings'))
const Employees = lazy(() => import('./pages/Employees'))
const Reports = lazy(() => import('./pages/Reports'))
const CreateProduct = lazy(() => import('./pages/CreateProduct'))
const Brands = lazy(() => import('./pages/Brands'))
const Units = lazy(() => import('./pages/Units'))
const SubCategories = lazy(() => import('./pages/SubCategories'))

// Placeholder components for new sidebar items
const PlaceholderPage = lazy(() => import('./components/PlaceholderPage'))

export default function AppRoutes() {
  const { token, user } = useSelector((state) => state.auth)
  const location = useLocation()

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/login" element={
          token ? <Navigate to="/dashboard" replace /> : <Login />
        } />
        <Route path="/signup" element={
          token ? <Navigate to="/dashboard" replace /> : <Signup />
        } />
        <Route path="/" element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }>
          <Route path="/dashboard" element={
            token ? (
              (user?.role === 'cashier' || user?.role === 'employee') ? <CashierDashboard /> : <Dashboard />
            ) : <Navigate to="/login" replace />
          } />
          <Route path="/products" element={<Products />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/employees" element={<Employees />} />
          <Route path="/admin/company" element={<CompanySettings />} />
          <Route path="/reports" element={<Reports />} />
          
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
        </Route>
      </Routes>
    </Suspense>
  )
}