/**
 * Permission Cache Service
 * 
 * Caches RBAC permissions to reduce database queries.
 * Uses in-memory cache with TTL (Time To Live) for automatic expiration.
 */

const RolePermission = require('../models/RolePermission');
const Permission = require('../models/Permission');
const logger = require('../utils/logger');

// In-memory cache storage
const cache = {
  // Cache structure: { role: { permissions: [...], timestamp: number } }
  rolePermissions: new Map(),
  
  // Cache structure: { userId: { permissions: [...], timestamp: number } }
  userPermissions: new Map()
};

// Cache configuration
const CACHE_CONFIG = {
  // TTL in milliseconds (default: 1 hour)
  TTL: parseInt(process.env.PERMISSION_CACHE_TTL) || 60 * 60 * 1000,
  
  // Maximum cache size (to prevent memory issues)
  MAX_SIZE: 1000
};

/**
 * Check if a cached entry is still valid
 * @param {number} timestamp - Cache entry timestamp
 * @returns {boolean} - True if cache is still valid
 */
function isCacheValid(timestamp) {
  return Date.now() - timestamp < CACHE_CONFIG.TTL;
}

/**
 * Get cached role permissions
 * @param {string} role - User role (admin, manager, cashier, employee)
 * @returns {Array<string>|null} - Cached permissions or null if not cached/invalid
 */
function getCachedRolePermissions(role) {
  const cached = cache.rolePermissions.get(role);
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.permissions;
  }
  
  // Remove invalid cache entry
  if (cached) {
    cache.rolePermissions.delete(role);
  }
  
  return null;
}

/**
 * Set cached role permissions
 * @param {string} role - User role
 * @param {Array<string>} permissions - Array of permission names
 */
function setCachedRolePermissions(role, permissions) {
  // Prevent cache from growing too large
  if (cache.rolePermissions.size >= CACHE_CONFIG.MAX_SIZE) {
    // Remove oldest entries (simple FIFO strategy)
    const firstKey = cache.rolePermissions.keys().next().value;
    cache.rolePermissions.delete(firstKey);
  }
  
  cache.rolePermissions.set(role, {
    permissions: [...permissions], // Create a copy to prevent mutation
    timestamp: Date.now()
  });
}

/**
 * Get cached user permissions
 * @param {number} userId - User ID
 * @returns {Array<string>|null} - Cached permissions or null if not cached/invalid
 */
function getCachedUserPermissions(userId) {
  const cached = cache.userPermissions.get(userId);
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.permissions;
  }
  
  // Remove invalid cache entry
  if (cached) {
    cache.userPermissions.delete(userId);
  }
  
  return null;
}

/**
 * Set cached user permissions
 * @param {number} userId - User ID
 * @param {Array<string>} permissions - Array of permission names
 */
function setCachedUserPermissions(userId, permissions) {
  // Prevent cache from growing too large
  if (cache.userPermissions.size >= CACHE_CONFIG.MAX_SIZE) {
    // Remove oldest entries (simple FIFO strategy)
    const firstKey = cache.userPermissions.keys().next().value;
    cache.userPermissions.delete(firstKey);
  }
  
  cache.userPermissions.set(userId, {
    permissions: [...permissions], // Create a copy to prevent mutation
    timestamp: Date.now()
  });
}

/**
 * Get permissions for a role from database or cache
 * @param {string} role - User role
 * @returns {Promise<Array<string>>} - Array of permission names
 */
async function getRolePermissions(role) {
  // Admin always has all permissions
  if (role === 'admin') {
    return ['all'];
  }
  
  // Check cache first
  const cached = getCachedRolePermissions(role);
  if (cached !== null) {
    logger.debug(`Permission cache HIT for role: ${role}`);
    return cached;
  }
  
  // Cache miss - fetch from database
  logger.debug(`Permission cache MISS for role: ${role}, fetching from database`);
  
  try {
    const rolePermissions = await RolePermission.findAll({
      include: [{
        model: Permission,
        attributes: ['name']
      }],
      where: { role }
    });
    
    const permissions = rolePermissions.map(rp => rp.Permission.name);
    
    // Cache the result
    setCachedRolePermissions(role, permissions);
    
    return permissions;
  } catch (error) {
    logger.error(`Error fetching permissions for role ${role}:`, error);
    throw error;
  }
}

/**
 * Get permissions for a user from database or cache
 * @param {number} userId - User ID
 * @param {string} role - User role
 * @returns {Promise<Array<string>>} - Array of permission names
 */
async function getUserPermissions(userId, role) {
  // Admin always has all permissions
  if (role === 'admin') {
    return ['all'];
  }
  
  // Check cache first
  const cached = getCachedUserPermissions(userId);
  if (cached !== null) {
    logger.debug(`Permission cache HIT for user: ${userId}`);
    return cached;
  }
  
  // Cache miss - fetch from database
  logger.debug(`Permission cache MISS for user: ${userId}, fetching from database`);
  
  try {
    const rolePermissions = await RolePermission.findAll({
      include: [{
        model: Permission,
        attributes: ['name']
      }],
      where: { role }
    });
    
    const permissions = rolePermissions.map(rp => rp.Permission.name);
    
    // Cache the result
    setCachedUserPermissions(userId, permissions);
    
    return permissions;
  } catch (error) {
    logger.error(`Error fetching permissions for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Check if a role has a specific permission
 * @param {string} role - User role
 * @param {string} permissionName - Permission name to check
 * @returns {Promise<boolean>} - True if role has permission
 */
async function roleHasPermission(role, permissionName) {
  // Admin always has all permissions
  if (role === 'admin') {
    return true;
  }
  
  const permissions = await getRolePermissions(role);
  return permissions.includes('all') || permissions.includes(permissionName);
}

/**
 * Check if a user has a specific permission
 * @param {number} userId - User ID
 * @param {string} role - User role
 * @param {string} permissionName - Permission name to check
 * @returns {Promise<boolean>} - True if user has permission
 */
async function userHasPermission(userId, role, permissionName) {
  // Admin always has all permissions
  if (role === 'admin') {
    return true;
  }
  
  const permissions = await getUserPermissions(userId, role);
  return permissions.includes('all') || permissions.includes(permissionName);
}

/**
 * Invalidate cache for a specific role
 * @param {string} role - User role
 */
function invalidateRoleCache(role) {
  cache.rolePermissions.delete(role);
  logger.debug(`Invalidated permission cache for role: ${role}`);
}

/**
 * Invalidate cache for a specific user
 * @param {number} userId - User ID
 */
function invalidateUserCache(userId) {
  cache.userPermissions.delete(userId);
  logger.debug(`Invalidated permission cache for user: ${userId}`);
}

/**
 * Invalidate all role permission caches
 * This should be called when permissions are modified
 */
function invalidateAllRoleCaches() {
  cache.rolePermissions.clear();
  logger.debug('Invalidated all role permission caches');
}

/**
 * Invalidate all user permission caches
 * This should be called when user roles are modified
 */
function invalidateAllUserCaches() {
  cache.userPermissions.clear();
  logger.debug('Invalidated all user permission caches');
}

/**
 * Clear all caches
 */
function clearAllCaches() {
  cache.rolePermissions.clear();
  cache.userPermissions.clear();
  logger.debug('Cleared all permission caches');
}

/**
 * Get cache statistics
 * @returns {Object} - Cache statistics
 */
function getCacheStats() {
  return {
    rolePermissions: {
      size: cache.rolePermissions.size,
      maxSize: CACHE_CONFIG.MAX_SIZE
    },
    userPermissions: {
      size: cache.userPermissions.size,
      maxSize: CACHE_CONFIG.MAX_SIZE
    },
    ttl: CACHE_CONFIG.TTL,
    ttlMinutes: Math.round(CACHE_CONFIG.TTL / 60000)
  };
}

module.exports = {
  getRolePermissions,
  getUserPermissions,
  roleHasPermission,
  userHasPermission,
  invalidateRoleCache,
  invalidateUserCache,
  invalidateAllRoleCaches,
  invalidateAllUserCaches,
  clearAllCaches,
  getCacheStats
};

