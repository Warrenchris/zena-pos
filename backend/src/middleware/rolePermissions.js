const ROLE_PERMISSIONS = {
  admin: ['all'],
  manager: [
    'view_dashboard',
    'manage_products',
    'manage_categories',
    'manage_employees',
    'view_reports',
    'manage_sales',
    'manage_expenses',
    'view_customers'
  ],
  cashier: [
    'access_pos',
    'create_sales',
    'view_products',
    'view_own_sales'
  ]
};

exports.checkPermission = (permission) => {
  return async (req, res, next) => {
    try {
      // Admin has all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      // Check specific permission
      const hasPermission = await req.user.hasPermission(permission);
      if (hasPermission) {
        return next();
      }

      return res.status(403).json({ error: 'Permission denied' });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Error checking permissions' });
    }
  };
};