import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useSelector } from 'react-redux'
import Layout from './components/Layout'
import PrivateRoute from './components/PrivateRoute'

// Lazy load components
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Products = lazy(() => import('./pages/Products'))
const Categories = lazy(() => import('./pages/Categories'))
const Customers = lazy(() => import('./pages/Customers'))
const Sales = lazy(() => import('./pages/Sales'))
const Expenses = lazy(() => import('./pages/Expenses'))
const Users = lazy(() => import('./pages/Users'))
const CompanySettings = lazy(() => import('./pages/CompanySettings'))
const Employees = lazy(() => import('./pages/Employees'))
const Reports = lazy(() => import('./pages/Reports'))

export default function AppRoutes() {
  const { token } = useSelector((state) => state.auth)
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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/employees" element={<Employees />} />
          <Route path="/admin/company" element={<CompanySettings />} />
          <Route path="/reports" element={<Reports />} />
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}