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
    'view_customers',
    'manage_settings'
  ],
  cashier: [
    'access_pos',
    'create_sales',
    'view_products',
    'view_own_sales'
  ],
  employee: [
    'access_pos',
    'create_sales',
    'view_products',
    'view_own_sales'
  ]
};

const checkUserPermission = (userRole, permission) => {
  // Admin has all permissions
  if (userRole === 'admin') return true;

  // Get permissions for the user's role
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];

  // Check if the role has the specific permission or 'all' permission
  return rolePermissions.includes('all') || rolePermissions.includes(permission);
};

exports.checkPermission = (permission) => {
  return (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        console.error('No user or role found in request');
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasPermission = checkUserPermission(req.user.role, permission);
      
      if (hasPermission) {
        return next();
      }

      return res.status(403).json({ 
        error: 'Permission denied',
        details: `User with role ${req.user.role} does not have permission: ${permission}`
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ 
        error: 'Error checking permissions',
        details: error.message 
      });
    }
  };
};