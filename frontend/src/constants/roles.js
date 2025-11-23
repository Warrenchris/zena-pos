export const SYSTEM_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  EMPLOYEE: 'employee'
};

export const ROLE_PERMISSIONS = {
  [SYSTEM_ROLES.ADMIN]: {
    name: 'Administrator',
    description: 'Full system access',
    permissions: ['all']
  },
  [SYSTEM_ROLES.MANAGER]: {
    name: 'Manager',
    description: 'Store management and reporting',
    permissions: [
      'view_dashboard',
      'manage_products',
      'manage_categories',
      'manage_employees',
      'view_reports',
      'manage_sales',
      'manage_expenses',
      'view_customers'
    ]
  },
  [SYSTEM_ROLES.CASHIER]: {
    name: 'Cashier',
    description: 'Sales and basic operations',
    permissions: [
      'access_pos',
      'create_sales',
      'view_products',
      'view_own_sales'
    ]
  },
  [SYSTEM_ROLES.EMPLOYEE]: {
    name: 'Employee',
    description: 'Sales and basic operations',
    permissions: [
      'access_pos',
      'create_sales',
      'view_products',
      'view_own_sales'
    ]
  }
};