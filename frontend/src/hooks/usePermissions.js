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
          { path: '/sales', label: 'Sales' },
          { path: '/products', label: 'Products' },
          { path: '/categories', label: 'Categories' },
          { path: '/customers', label: 'Customers' },
          { path: '/expenses', label: 'Expenses' },
          { path: '/admin/employees', label: 'Employees' },
          { path: '/admin/users', label: 'Users' },
          { path: '/settings', label: 'Settings' },
          { path: '/reports', label: 'Reports' },
        ];
      case 'manager':
        return [
          { path: '/dashboard', label: 'Dashboard' },
          { path: '/sales', label: 'Sales' },
          { path: '/products', label: 'Products' },
          { path: '/categories', label: 'Categories' },
          { path: '/customers', label: 'Customers' },
          { path: '/expenses', label: 'Expenses' },
          { path: '/settings', label: 'Settings' },
          { path: '/reports', label: 'Reports' },
        ];
      case 'cashier':
        return [
          { path: '/dashboard', label: 'POS' },
          { path: '/sales', label: 'My Sales' },
        ];
      default:
        return [];
    }
  }, [userRole]);

  return {
    hasPermission,
    getRoutesByRole,
    userRole
  };
};