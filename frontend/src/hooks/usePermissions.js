import { useSelector } from 'react-redux';
import { useCallback } from 'react';
import { ROLE_PERMISSIONS } from '../constants/roles';

export const usePermissions = () => {
  const { user } = useSelector((state) => state.auth);
  const userRole = user?.role || 'cashier';

  const hasPermission = (permission) => {
    if (!user) return false;

    // Admin has all permissions
    if (userRole === 'admin' || ROLE_PERMISSIONS[userRole].permissions.includes('all')) {
      return true;
    }

    // Check specific permission
    return ROLE_PERMISSIONS[userRole].permissions.includes(permission);
  };

  const getRoutesByRole = useCallback(() => {
    switch (userRole) {
      case 'admin':
        return [
          { path: '/dashboard', label: 'Dashboard' },
          { path: '/pos', label: 'POS' },
          { path: '/sales', label: 'Sales' },
          { path: '/invoices', label: 'Invoices' },
          { path: '/products', label: 'Products' },
          { path: '/categories', label: 'Categories' },
          { path: '/customers', label: 'Customers' },
          { path: '/purchases', label: 'Purchases' },
          { path: '/purchase-orders', label: 'Purchase Orders' },
          { path: '/purchase-returns', label: 'Purchase Returns' },
          { path: '/expenses', label: 'Expenses' },
          { path: '/coupons', label: 'Coupons' },
          { path: '/discounts', label: 'Discounts' },
          // Support both canonical and admin-aliased employees routes
          { path: '/employees', label: 'Employees' },
          { path: '/admin/employees', label: 'Employees' },
          { path: '/admin/users', label: 'Users' },
          // AI & Analytics
          { path: '/admin/ai', label: 'AI Services' },
          { path: '/ai/forecasting', label: 'AI Forecasting' },
          { path: '/ai/insights', label: 'AI Insights' },
          { path: '/ai/finance', label: 'AI Finance' },
          { path: '/settings', label: 'Settings' },
          { path: '/reports', label: 'Reports' },
        ];
      case 'manager':
        return [
          { path: '/dashboard', label: 'Dashboard' },
          { path: '/sales', label: 'Sales' },
          { path: '/invoices', label: 'Invoices' },
          { path: '/products', label: 'Products' },
          { path: '/categories', label: 'Categories' },
          { path: '/customers', label: 'Customers' },
          { path: '/purchases', label: 'Purchases' },
          { path: '/purchase-orders', label: 'Purchase Orders' },
          { path: '/purchase-returns', label: 'Purchase Returns' },
          { path: '/expenses', label: 'Expenses' },
          { path: '/coupons', label: 'Coupons' },
          { path: '/discounts', label: 'Discounts' },
          // Managers can manage employees per role permissions
          { path: '/employees', label: 'Employees' },
          { path: '/settings', label: 'Settings' },
          { path: '/reports', label: 'Reports' },
        ];
      case 'cashier':
      case 'employee':
        return [
          { path: '/dashboard', label: 'POS' },
          { path: '/my-sales', label: 'My Sales' },
          { path: '/products', label: 'Products' },
          { path: '/customers', label: 'Customers' },
          { path: '/invoices', label: 'Invoices' },
          { path: '/sales/returns', label: 'Sales Return' },
          { path: '/settings', label: 'Settings' },
        ];
      default:
        return [];
    }
  }, [userRole, user]);

  return {
    hasPermission,
    getRoutesByRole,
    userRole
  };
};