import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import PlatformRoute from './components/platform/PlatformRoute';
import PlatformLayout from './components/platform/PlatformLayout';
import RootLayout from './components/RootLayout';
import Layout from './components/Layout';
import DashboardRouter from './components/DashboardRouter';
import ErrorBoundary from './components/ErrorBoundary';
import RouteError from './components/RouteError';

import { useSelector } from 'react-redux';

import { safeLazy } from './utils/safeLazy';

const Login = safeLazy(() => import('./pages/Login'));
const ResetPassword = safeLazy(() => import('./pages/ResetPassword'));
const VerifyEmail = safeLazy(() => import('./pages/VerifyEmail'));
const Signup = safeLazy(() => import('./pages/Signup'));
const ToastExample = safeLazy(() => import('./pages/ToastExample'));
const Products = safeLazy(() => import('./pages/Products'));
const Customers = safeLazy(() => import('./pages/Customers'));
const Employees = safeLazy(() => import('./pages/Employees'));
const CompanySettings = safeLazy(() => import('./pages/CompanySettings'));
const MySales = safeLazy(() => import('./pages/MySales'));
const PublicReceiptView = safeLazy(() => import('./pages/PublicReceiptView'));
const TestDatePicker = safeLazy(() => import('./pages/TestDatePicker'));
const PlaceholderPage = safeLazy(() => import('./components/PlaceholderPage'));
const AiServices = safeLazy(() => import('./pages/AiServices'));
const AIInsights = safeLazy(() => import('./pages/AIInsights'));
const SalesForecasting = safeLazy(() => import('./pages/SalesForecasting'));
const FinancialAnalysis = safeLazy(() => import('./pages/FinancialAnalysis'));
const Reports = safeLazy(() => import('./pages/Reports'));
const Settings = safeLazy(() => import('./pages/Settings'));
const Billing = safeLazy(() => import('./pages/Billing'));
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
const LandingPage = safeLazy(() => import('./components/landing/LandingPage'));
const TermsOfService = safeLazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = safeLazy(() => import('./pages/PrivacyPolicy'));
const PlatformOverview = safeLazy(() => import('./pages/platform/PlatformOverview'));
const PlatformOrganizations = safeLazy(() => import('./pages/platform/PlatformOrganizations'));
const PlatformOrgDetail = safeLazy(() => import('./pages/platform/PlatformOrgDetail'));
const PlatformPlans = safeLazy(() => import('./pages/platform/PlatformPlans'));
const PlatformInvoices = safeLazy(() => import('./pages/platform/PlatformInvoices'));
const PlatformNotifications = safeLazy(() => import('./pages/platform/PlatformNotifications'));

const HomeRoute = () => {
  const { token, user } = useSelector((state) => state.auth);
  if (token && user) {
    if (user.role === 'super_admin') {
      return <Navigate to="/platform" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingPage />;
};

export const routes = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: <HomeRoute />
      },
      {
        path: 'r/:token',
        element: <PublicReceiptView />
      },
      {
        path: 'login',
        element: <Login />
      },
      {
        path: 'reset-password',
        element: <ResetPassword />
      },
      {
        path: 'verify-email',
        element: <VerifyEmail />
      },
      {
        path: 'signup',
        element: <Signup />
      },
      {
        path: 'terms',
        element: <TermsOfService />
      },
      {
        path: 'privacy',
        element: <PrivacyPolicy />
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
            path: 'admin/users',
            element: <PrivateRoute><Employees /></PrivateRoute>
          },
          {
            path: 'admin/company',
            element: <PrivateRoute><CompanySettings /></PrivateRoute>
          },
          {
            path: 'users',
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
            path: 'billing',
            element: <PrivateRoute><Billing /></PrivateRoute>
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
      },
      // Platform Console routes (strictly for super_admin)
      {
        path: 'platform',
        element: (
          <PlatformRoute>
            <PlatformLayout />
          </PlatformRoute>
        ),
        children: [
          {
            index: true,
            element: <PlatformOverview />
          },
          {
            path: 'organizations',
            element: <PlatformOrganizations />
          },
          {
            path: 'organizations/:id',
            element: <PlatformOrgDetail />
          },
          {
            path: 'plans',
            element: <PlatformPlans />
          },
          {
            path: 'invoices',
            element: <PlatformInvoices />
          },
          {
            path: 'notifications',
            element: <PlatformNotifications />
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