const permissionCache = require('../services/permissionCache');

// Hardcoded role permissions (fallback for performance)
// These are used as a fast lookup when database queries are not needed
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
    'manage_settings',
    'process_refunds'
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

/**
 * Check permission using hardcoded permissions (fast, synchronous)
 * @param {string} userRole - User role
 * @param {string} permission - Permission to check
 * @returns {boolean} - True if user has permission
 */
const checkUserPermissionSync = (userRole, permission) => {
  // Admin has all permissions
  if (userRole === 'admin') return true;

  // Get permissions for the user's role
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];

  // Check if the role has the specific permission or 'all' permission
  return rolePermissions.includes('all') || rolePermissions.includes(permission);
};

/**
 * Check permission using cached database permissions (async, uses cache)
 * @param {number} userId - User ID
 * @param {string} userRole - User role
 * @param {string} permission - Permission to check
 * @returns {Promise<boolean>} - True if user has permission
 */
const checkUserPermissionAsync = async (userId, userRole, permission) => {
  return permissionCache.userHasPermission(userId, userRole, permission);
};

/**
 * Middleware to check if user has a specific permission
 * Uses hardcoded permissions by default for performance, but can use cache if needed
 * 
 * @param {string} permission - Permission name to check
 * @param {Object} options - Options object
 * @param {boolean} options.useCache - If true, uses cached database permissions instead of hardcoded
 * @returns {Function} - Express middleware function
 */
exports.checkPermission = (permission, options = {}) => {
  const { useCache = false } = options;
  
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        console.error('No user or role found in request');
        return res.status(401).json({ error: 'Authentication required' });
      }

      let hasPermission;
      
      if (useCache && req.user.id) {
        // Use cached database permissions
        hasPermission = await checkUserPermissionAsync(req.user.id, req.user.role, permission);
      } else {
        // Use hardcoded permissions (faster, synchronous)
        hasPermission = checkUserPermissionSync(req.user.role, permission);
      }
      
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

/**
 * Get all permissions for a role (uses cache)
 * @param {string} role - User role
 * @returns {Promise<Array<string>>} - Array of permission names
 */
exports.getRolePermissions = async (role) => {
  return permissionCache.getRolePermissions(role);
};

/**
 * Get all permissions for a user (uses cache)
 * @param {number} userId - User ID
 * @param {string} role - User role
 * @returns {Promise<Array<string>>} - Array of permission names
 */
exports.getUserPermissions = async (userId, role) => {
  return permissionCache.getUserPermissions(userId, role);
};