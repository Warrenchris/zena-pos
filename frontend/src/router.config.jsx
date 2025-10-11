import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import RootLayout from './components/RootLayout';
import Layout from './components/Layout';
import DashboardRouter from './components/DashboardRouter';

const Login = lazy(() => import('./pages/Login'));
const CashierDashboard = lazy(() => import('./pages/CashierDashboard.jsx'));
const Products = lazy(() => import('./pages/Products'));
const MySales = lazy(() => import('./pages/MySales'));
const TestDatePicker = lazy(() => import('./pages/TestDatePicker'));
const PlaceholderPage = lazy(() => import('./components/PlaceholderPage'));

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
            path: 'products',
            element: <PrivateRoute><Products /></PrivateRoute>
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
             element: <PlaceholderPage />
           },
           {
             path: 'products/expired',
             element: <PlaceholderPage />
           },
           {
             path: 'products/low-stock',
             element: <PlaceholderPage />
           },
           {
             path: 'categories',
             element: <PlaceholderPage />
           },
           {
             path: 'categories/sub',
             element: <PlaceholderPage />
           },
           {
             path: 'brands',
             element: <PlaceholderPage />
           },
           {
             path: 'units',
             element: <PlaceholderPage />
           },
           {
             path: 'variants',
             element: <PlaceholderPage />
           },
           {
             path: 'warranties',
             element: <PlaceholderPage />
           },
           {
             path: 'print/barcode',
             element: <PlaceholderPage />
           },
           {
             path: 'print/qr',
             element: <PlaceholderPage />
           },
           // Stock sections
           {
             path: 'stock/manage',
             element: <PlaceholderPage />
           },
           {
             path: 'stock/adjustment',
             element: <PlaceholderPage />
           },
           {
             path: 'stock/transfer',
             element: <PlaceholderPage />
           },
           // Sales sections
           {
             path: 'invoices',
             element: <PlaceholderPage />
           },
           {
             path: 'sales/returns',
             element: <PlaceholderPage />
           },
           {
             path: 'quotations',
             element: <PlaceholderPage />
           },
           {
             path: 'pos',
             element: <PlaceholderPage />
           },
           // Promo sections
           {
             path: 'coupons',
             element: <PlaceholderPage />
           },
           {
             path: 'gift-cards',
             element: <PlaceholderPage />
           },
           {
             path: 'discounts',
             element: <PlaceholderPage />
           },
           // Purchases sections
           {
             path: 'purchases',
             element: <PlaceholderPage />
           },
           {
             path: 'purchase-orders',
             element: <PlaceholderPage />
           },
           {
             path: 'purchase-returns',
             element: <PlaceholderPage />
           },
           // Finance sections
           {
             path: 'expenses',
             element: <PlaceholderPage />
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