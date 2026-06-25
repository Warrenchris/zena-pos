const RolePermission = require('../models/RolePermission');
const Permission = require('../models/Permission');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');

const CACHE_TTL = 3600; // 1 hour in seconds

async function getRolePermissions(role) {
  if (role === 'admin') {
    return ['all'];
  }

  const cacheKey = `permissions:role:${role}`;

  try {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      logger.debug(`Permission cache HIT for role: ${role}`);
      return JSON.parse(cachedData);
    }
  } catch (err) {
    logger.warn(`Redis error fetching permissions for role ${role}, falling back to DB:`, err);
  }

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

    try {
      await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(permissions));
    } catch (err) {
      logger.warn(`Redis error saving permissions for role ${role}:`, err);
    }

    return permissions;
  } catch (error) {
    logger.error(`Error fetching permissions for role ${role}:`, error);
    throw error;
  }
}

async function getUserPermissions(userId, role) {
  // User permissions map directly to role permissions, so we load from the role cache
  return getRolePermissions(role);
}

async function roleHasPermission(role, permissionName) {
  if (role === 'admin') {
    return true;
  }
  const permissions = await getRolePermissions(role);
  return permissions.includes('all') || permissions.includes(permissionName);
}

async function userHasPermission(userId, role, permissionName) {
  return roleHasPermission(role, permissionName);
}

async function invalidateRoleCache(role) {
  const cacheKey = `permissions:role:${role}`;
  try {
    await redisClient.del(cacheKey);
    logger.info(`Invalidated permission cache in Redis for role: ${role}`);
  } catch (error) {
    logger.warn(`Redis error invalidating cache for role ${role}:`, error);
  }
}

function invalidateUserCache(userId) {
  // No-op since we cache role-level keys in Redis
}

async function invalidateAllPermissionCache() {
  try {
    let cursor = '0';
    do {
      const reply = await redisClient.scan(cursor, 'MATCH', 'permissions:role:*', 'COUNT', 100);
      cursor = reply[0];
      const keys = reply[1];
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } while (cursor !== '0');
    logger.info('Invalidated all permission caches in Redis');
  } catch (error) {
    logger.warn('Failed to invalidate all permission caches in Redis:', error);
  }
}

async function invalidateAllRoleCaches() {
  await invalidateAllPermissionCache();
}

function invalidateAllUserCaches() {
  // No-op
}

async function clearAllCaches() {
  await invalidateAllPermissionCache();
}

function getCacheStats() {
  return {
    type: 'redis',
    ttl: CACHE_TTL
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
