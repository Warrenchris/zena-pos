import React, { lazy, Suspense } from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { isManagerTier } from '../utils/roles';
import Spinner from './ui/Spinner';

const Dashboard = lazy(() => import('../pages/Dashboard'));
const CashierDashboard = lazy(() => import('../pages/CashierDashboard'));

const DashboardRouter = () => {
  const { user } = useSelector((state) => state.auth);
  if (user?.role === 'super_admin') {
    return <Navigate to="/platform" replace />;
  }
  return isManagerTier(user?.role) ? (
    <Suspense fallback={<Spinner />}>
      <Dashboard />
    </Suspense>
  ) : (
    <Suspense fallback={<Spinner />}>
      <CashierDashboard />
    </Suspense>
  );
};

export default DashboardRouter;
