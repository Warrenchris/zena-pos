import React, { lazy, Suspense } from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { isManagerTier } from '../utils/roles';
import Dashboard from '../pages/Dashboard';
import Spinner from './ui/Spinner';

const CashierDashboard = lazy(() => import('../pages/CashierDashboard'));

const DashboardRouter = () => {
  const { user } = useSelector((state) => state.auth);
  if (user?.role === 'super_admin') {
    return <Navigate to="/platform" replace />;
  }
  return isManagerTier(user?.role) ? (
    <Dashboard />
  ) : (
    <Suspense fallback={<Spinner />}>
      <CashierDashboard />
    </Suspense>
  );
};

export default DashboardRouter;
