import React from 'react';
import { useSelector } from 'react-redux';
import Dashboard from '../pages/Dashboard';
import CashierDashboard from '../pages/CashierDashboard';

const DashboardRouter = () => {
  const { user } = useSelector((state) => state.auth);
  return user?.role === 'admin' ? <Dashboard /> : <CashierDashboard />;
};

export default DashboardRouter;