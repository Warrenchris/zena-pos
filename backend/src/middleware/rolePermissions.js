const permissionCache = require('../services/permissionCache');
const logger = require('../utils/logger');

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
    'process_refunds',
    'manage_coupons',
    'manage_discounts',
    'manage_held_carts'
  ],
  // Delegated org admin: employee with orgRole='admin' on their
  // OrganizationMembership. Gets manager-equivalent shop-level permissions
  // within shops they have ShopAccess to. Does NOT get the unscoped 'all'
  // permission that true admin (User.role='admin' = owner) has.
  org_admin: [
    'view_dashboard',
    'manage_products',
    'manage_categories',
    'manage_employees',
    'view_reports',
    'manage_sales',
    'manage_expenses',
    'view_customers',
    'manage_settings',
    'process_refunds',
    'manage_coupons',
    'manage_discounts',
    'manage_held_carts'
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
 * @param {number} organizationId - Organization ID
 * @returns {Promise<boolean>} - True if user has permission
 */
const checkUserPermissionAsync = async (userId, userRole, permission, organizationId) => {
  return permissionCache.userHasPermission(userId, userRole, permission, organizationId);
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
exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;

/**
 * Middleware to check if user has a specific permission
 * Evaluates against authoritative req.authz.permissions.
 * Fails closed if req.authz is missing.
 * 
 * @param {string} permission - Permission name to check
 * @param {Object} options - Options object
 * @returns {Function} - Express middleware function
 */
exports.checkPermission = (permission, options = {}) => {
  return async (req, res, next) => {
    try {
      // FAIL-CLOSED INVARIANT (Section 6.2):
      if (!req.authz) {
        logger.error('[SECURITY INVARIANT VIOLATION] req.authz is missing in checkPermission', {
          url: req.originalUrl,
          method: req.method,
          requestId: req.requestId || req.id
        });
        return res.status(500).json({
          error: 'Internal authorization error: authorization context uninitialized.',
          code: 'AUTHORIZATION_CONTEXT_MISSING'
        });
      }

      const hasPermission = req.authz.permissions.has(permission);
      
      if (hasPermission) {
        return next();
      }

      return res.status(403).json({ 
        error: 'Permission denied',
        details: `User with role ${req.authz.role.effectiveRole} does not have permission: ${permission}`
      });
    } catch (error) {
      logger.error('Permission check error:', error);
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
 * @param {number} organizationId - Organization ID
 * @returns {Promise<Array<string>>} - Array of permission names
 */
exports.getRolePermissions = async (role, organizationId) => {
  return permissionCache.getRolePermissions(role, organizationId);
};

/**
 * Get all permissions for a user (uses cache)
 * @param {number} userId - User ID
 * @param {string} role - User role
 * @param {number} organizationId - Organization ID
 * @returns {Promise<Array<string>>} - Array of permission names
 */
exports.getUserPermissions = async (userId, role, organizationId) => {
  return permissionCache.getUserPermissions(userId, role, organizationId);
};