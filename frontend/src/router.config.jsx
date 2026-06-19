import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import RootLayout from './components/RootLayout';
import Layout from './components/Layout';
import DashboardRouter from './components/DashboardRouter';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const ToastExample = lazy(() => import('./pages/ToastExample'));
const CashierDashboard = lazy(() => import('./pages/CashierDashboard.jsx'));
const Products = lazy(() => import('./pages/Products'));
const Customers = lazy(() => import('./pages/Customers'));
const Employees = lazy(() => import('./pages/Employees'));
const MySales = lazy(() => import('./pages/MySales'));
const TestDatePicker = lazy(() => import('./pages/TestDatePicker'));
const PlaceholderPage = lazy(() => import('./components/PlaceholderPage'));
const AiServices = lazy(() => import('./pages/AiServices'));
const AIInsights = lazy(() => import('./pages/AIInsights'));
const SalesForecasting = lazy(() => import('./pages/SalesForecasting'));
const FinancialAnalysis = lazy(() => import('./pages/FinancialAnalysis'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Quotations = lazy(() => import('./pages/Quotations'));
const Purchases = lazy(() => import('./pages/Purchases'));
const PurchaseOrders = lazy(() => import('./pages/PurchaseOrders'));
const PurchaseReturns = lazy(() => import('./pages/PurchaseReturns'));
const SalesReturns = lazy(() => import('./pages/SalesReturns'));
const Coupons = lazy(() => import('./pages/Coupons'));
const GiftCards = lazy(() => import('./pages/GiftCards'));
const Discounts = lazy(() => import('./pages/Discounts'));
const Brands = lazy(() => import('./pages/Brands'));
const Units = lazy(() => import('./pages/Units'));
const Variants = lazy(() => import('./pages/Variants'));
const Warranties = lazy(() => import('./pages/Warranties'));
const PrintBarcode = lazy(() => import('./pages/PrintBarcode'));
const PrintQR = lazy(() => import('./pages/PrintQR'));
const ManageStock = lazy(() => import('./pages/ManageStock'));
const StockAdjustment = lazy(() => import('./pages/StockAdjustment'));
const StockTransfer = lazy(() => import('./pages/StockTransfer'));
const ExpensesPage = lazy(() => import('./pages/Expenses'));
const CategoriesPage = lazy(() => import('./pages/Categories'));
const SubCategories = lazy(() => import('./pages/SubCategories'));
const Pos = lazy(() => import('./pages/Pos'));
const CreateProduct = lazy(() => import('./pages/CreateProduct'));

export const routes = [
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />
      },
      {
        path: 'login',
        element: <Login />
      },
      {
        path: 'signup',
        element: <Signup />
      },
      {
        path: 'toast-example',
        element: <ToastExample />
      },
      {
        element: <Layout />,
        children: [
          {
            path: 'dashboard',
            element: (
              <PrivateRoute>
                <DashboardRouter />
              </PrivateRoute>
            )
          },
          {
            path: 'products/view',
            element: <PrivateRoute><Products /></PrivateRoute>
          },
          {
            path: 'products',
            element: <PrivateRoute><Products /></PrivateRoute>
          },
          {
            path: 'products/create',
            element: (
              <ErrorBoundary>
                <PrivateRoute>
                  <Suspense fallback={<div>Loading...</div>}>
                    <CreateProduct />
                  </Suspense>
                </PrivateRoute>
              </ErrorBoundary>
            )
          },
          {
            path: 'customers',
            element: <PrivateRoute><Customers /></PrivateRoute>
          },
          {
            path: 'employees',
            element: (
              <ErrorBoundary>
                <PrivateRoute><Employees /></PrivateRoute>
              </ErrorBoundary>
            )
          },
          // Admin aliases
          {
            path: 'admin/employees',
            element: (
              <ErrorBoundary>
                <PrivateRoute><Employees /></PrivateRoute>
              </ErrorBoundary>
            )
          },
          {
            path: 'admin/users',
            element: <PlaceholderPage />
          },
          {
            path: 'admin/company',
            element: <PlaceholderPage />
          },
          // Settings are handled by the /settings route below
          {
            path: 'admin/ai',
            element: (
              <PrivateRoute>
                <AiServices />
              </PrivateRoute>
            )
          },
          {
            path: 'my-sales',
            element: <PrivateRoute><MySales /></PrivateRoute>
          },
          {
            // alias for legacy routes that reference /sales
            path: 'sales',
            element: <PrivateRoute><MySales /></PrivateRoute>
          },
          // Common admin items not yet implemented
          {
            path: 'reports',
            element: <PrivateRoute><Reports /></PrivateRoute>
          },
          {
            path: 'settings',
            element: <PrivateRoute><Settings /></PrivateRoute>
          },
          {
            path: 'test-date-picker',
            element: <TestDatePicker />
          },
          // Main sections
          {
            path: 'super-admin',
            element: <PlaceholderPage />
          },
          {
            path: 'applications',
            element: <PlaceholderPage />
          },
          {
            path: 'layouts',
            element: <PlaceholderPage />
          },
          // Inventory sections
          {
            path: 'products/create',
            element: <PrivateRoute><Products /></PrivateRoute>
          },
          {
            path: 'products/expired',
            element: <PrivateRoute><Products /></PrivateRoute>
          },
          {
            path: 'products/low-stock',
            element: <PrivateRoute><Products /></PrivateRoute>
          },
          {
            path: 'categories',
            element: <PrivateRoute><CategoriesPage /></PrivateRoute>
          },
          {
            path: 'categories/sub',
            element: <PrivateRoute><SubCategories /></PrivateRoute>
          },
          {
            path: 'brands',
            element: <PrivateRoute><Brands /></PrivateRoute>
          },
          {
            path: 'units',
            element: <PrivateRoute><Units /></PrivateRoute>
          },
          {
            path: 'variants',
            element: <PrivateRoute><Variants /></PrivateRoute>
          },
          {
            path: 'warranties',
            element: <PrivateRoute><Warranties /></PrivateRoute>
          },
          {
            path: 'print/barcode',
            element: <PrivateRoute><PrintBarcode /></PrivateRoute>
          },
          {
            path: 'print/qr',
            element: <PrivateRoute><PrintQR /></PrivateRoute>
          },
          // Stock sections
          {
            path: 'stock/manage',
            element: <PrivateRoute><ManageStock /></PrivateRoute>
          },
          {
            path: 'stock/adjustment',
            element: <PrivateRoute><StockAdjustment /></PrivateRoute>
          },
          {
            path: 'stock/transfer',
            element: <PrivateRoute><StockTransfer /></PrivateRoute>
          },
          // Sales sections
          {
            path: 'invoices',
            element: <PrivateRoute><Invoices /></PrivateRoute>
          },
          {
            path: 'sales/returns',
            element: <PrivateRoute><SalesReturns /></PrivateRoute>
          },
          {
            path: 'quotations',
            element: <PrivateRoute><Quotations /></PrivateRoute>
          },
          {
            path: 'pos',
            element: <PrivateRoute><CashierDashboard /></PrivateRoute>
          },
          // AI & Analytics
          {
            path: 'ai/forecasting',
            element: (
              <PrivateRoute>
                <SalesForecasting />
              </PrivateRoute>
            )
          },
          {
            path: 'ai/insights',
            element: (
              <PrivateRoute>
                <AIInsights />
              </PrivateRoute>
            )
          },
          {
            path: 'ai/finance',
            element: (
              <PrivateRoute>
                <FinancialAnalysis />
              </PrivateRoute>
            )
          },
          // Promo sections
          {
            path: 'coupons',
            element: <PrivateRoute><Coupons /></PrivateRoute>
          },
          {
            path: 'gift-cards',
            element: <PrivateRoute><GiftCards /></PrivateRoute>
          },
          {
            path: 'discounts',
            element: <PrivateRoute><Discounts /></PrivateRoute>
          },
          // Purchases sections
          {
            path: 'purchases',
            element: <PrivateRoute><Purchases /></PrivateRoute>
          },
          {
            path: 'purchase-orders',
            element: <PrivateRoute><PurchaseOrders /></PrivateRoute>
          },
          {
            path: 'purchase-returns',
            element: <PrivateRoute><PurchaseReturns /></PrivateRoute>
          },
          // Finance sections
          {
            path: 'expenses',
            element: <PrivateRoute><ExpensesPage /></PrivateRoute>
          }
        ]
      }
    ]
  }
];

export const router = createBrowserRouter(routes, {
  future: {
    v7_startTransition: true,
  },
});