import React from 'react';
import { useSelector } from 'react-redux';
import { isManagerTier } from '../utils/roles';
import Dashboard from '../pages/Dashboard';
import CashierDashboard from '../pages/CashierDashboard';

const DashboardRouter = () => {
  const { user } = useSelector((state) => state.auth);
  return isManagerTier(user?.role) ? <Dashboard /> : <CashierDashboard />;
};

export default DashboardRouter;