import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';
import { isManagerTier } from '../utils/roles';
import Dashboard from '../pages/Dashboard';
import CashierDashboard from '../pages/CashierDashboard';

const DashboardRouter = () => {
  const { user } = useSelector((state) => state.auth);
  if (user?.role === 'super_admin') {
    return <Navigate to="/platform" replace />;
  }
  return isManagerTier(user?.role) ? <Dashboard /> : <CashierDashboard />;
};

export default DashboardRouter;