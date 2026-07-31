import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import RootLayout from './components/RootLayout';
import Layout from './components/Layout';
import DashboardRouter from './components/DashboardRouter';
import ErrorBoundary from './components/ErrorBoundary';
import RouteError from './components/RouteError';

// Safe Lazy Loader with automatic retry and graceful fallback on Vite HMR/Chunk loading errors
const safeLazy = (importFunc) => {
  return lazy(() =>
    importFunc().catch(error => {
      console.error('Dynamic module import failed:', error);
      if (typeof window !== 'undefined') {
        const key = 'chunk_retry_' + window.location.pathname;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, 'true');
          window.location.reload();
          return new Promise(() => {});
        }
        sessionStorage.removeItem(key);
      }
      return {
        default: () => (
          <div className="p-8 max-w-md mx-auto my-12 bg-surface border border-border-default rounded-2xl shadow-floating text-center">
            <div className="w-12 h-12 bg-warning/10 text-warning rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-h3 font-bold text-text-primary mb-1">Page Update Available</h3>
            <p className="text-small text-text-muted mb-4">A new application update or component file was updated. Please refresh your browser.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-white font-semibold rounded-xl hover:bg-primary-hover transition-colors"
            >
              Reload Page
            </button>
          </div>
        )
      };
    })
  );
};

const Login = safeLazy(() => import('./pages/Login'));
const Signup = safeLazy(() => import('./pages/Signup'));
const ToastExample = safeLazy(() => import('./pages/ToastExample'));
const Products = safeLazy(() => import('./pages/Products'));
const Customers = safeLazy(() => import('./pages/Customers'));
const Employees = safeLazy(() => import('./pages/Employees'));
const MySales = safeLazy(() => import('./pages/MySales'));
const TestDatePicker = safeLazy(() => import('./pages/TestDatePicker'));
const PlaceholderPage = safeLazy(() => import('./components/PlaceholderPage'));
const AiServices = safeLazy(() => import('./pages/AiServices'));
const AIInsights = safeLazy(() => import('./pages/AIInsights'));
const SalesForecasting = safeLazy(() => import('./pages/SalesForecasting'));
const FinancialAnalysis = safeLazy(() => import('./pages/FinancialAnalysis'));
const Reports = safeLazy(() => import('./pages/Reports'));
const Settings = safeLazy(() => import('./pages/Settings'));
const Invoices = safeLazy(() => import('./pages/Invoices'));
const Quotations = safeLazy(() => import('./pages/Quotations'));
const Purchases = safeLazy(() => import('./pages/Purchases'));
const PurchaseOrders = safeLazy(() => import('./pages/PurchaseOrders'));
const PurchaseReturns = safeLazy(() => import('./pages/PurchaseReturns'));
const SalesReturns = safeLazy(() => import('./pages/SalesReturns'));
const Coupons = safeLazy(() => import('./pages/Coupons'));
const GiftCards = safeLazy(() => import('./pages/GiftCards'));
const Discounts = safeLazy(() => import('./pages/Discounts'));
const Brands = safeLazy(() => import('./pages/Brands'));
const Units = safeLazy(() => import('./pages/Units'));
const Variants = safeLazy(() => import('./pages/Variants'));
const Warranties = safeLazy(() => import('./pages/Warranties'));
const PrintBarcode = safeLazy(() => import('./pages/PrintBarcode'));
const PrintQR = safeLazy(() => import('./pages/PrintQR'));
const ManageStock = safeLazy(() => import('./pages/ManageStock'));
const StockAdjustment = safeLazy(() => import('./pages/StockAdjustment'));
const StockTransfer = safeLazy(() => import('./pages/StockTransfer'));
const ExpensesPage = safeLazy(() => import('./pages/Expenses'));
const CategoriesPage = safeLazy(() => import('./pages/Categories'));
const SubCategories = safeLazy(() => import('./pages/SubCategories'));
const Pos = safeLazy(() => import('./pages/CashierDashboard'));
const CreateProduct = safeLazy(() => import('./pages/CreateProduct'));

export const routes = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
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
        errorElement: <RouteError />,
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
                  <Suspense fallback={<div className="p-8 text-center text-text-muted">Loading...</div>}>
                    <CreateProduct />
                  </Suspense>
                </PrivateRoute>
              </ErrorBoundary>
            )
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
            path: 'customers',
            element: <PrivateRoute><Customers /></PrivateRoute>
          },
          {
            path: 'employees',
            element: <PrivateRoute><Employees /></PrivateRoute>
          },
          {
            path: 'admin/employees',
            element: <PrivateRoute><Employees /></PrivateRoute>
          },
          {
            path: 'my-sales',
            element: <PrivateRoute><MySales /></PrivateRoute>
          },
          {
            path: 'sales',
            element: <PrivateRoute><MySales /></PrivateRoute>
          },
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
            element: <PrivateRoute><Pos /></PrivateRoute>
          },
          // AI & Analytics
          {
            path: 'ai/forecasting',
            element: <PrivateRoute><SalesForecasting /></PrivateRoute>
          },
          {
            path: 'ai/insights',
            element: <PrivateRoute><AIInsights /></PrivateRoute>
          },
          {
            path: 'ai/finance',
            element: <PrivateRoute><FinancialAnalysis /></PrivateRoute>
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