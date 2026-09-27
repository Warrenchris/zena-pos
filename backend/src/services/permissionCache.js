const RolePermission = require('../models/RolePermission');
const Permission = require('../models/Permission');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');

// NOTE: The 'org_admin' resolved role is intentionally excluded from this
// DB-driven permission cache. org_admin permissions are served exclusively by
// the hardcoded ROLE_PERMISSIONS lookup in rolePermissions.js (synchronous
// path). No routes currently use useCache:true, but if that changes, either:
//   (a) seed RolePermission rows for 'org_admin' in permissionController.js, or
//   (b) fall back to ROLE_PERMISSIONS for roles without DB rows (preferred).
const CACHE_TTL = 3600; // 1 hour in seconds

async function getRolePermissions(role, organizationId) {
  if (role === 'admin') {
    return ['all'];
  }

  if (!organizationId) {
    logger.warn(`getRolePermissions called without organizationId for role: ${role}`);
    return [];
  }

  const cacheKey = `permissions:org:${organizationId}:role:${role}`;

  try {
    const cachedData = redisClient.status === 'ready' ? await redisClient.get(cacheKey) : null;
    if (cachedData) {
      logger.debug(`Permission cache HIT for org: ${organizationId}, role: ${role}`);
      return JSON.parse(cachedData);
    }
  } catch (err) {
    logger.warn(`Redis error fetching permissions for org ${organizationId} role ${role}, falling back to DB:`, err);
  }

  logger.debug(`Permission cache MISS for org: ${organizationId}, role: ${role}, fetching from database`);
  try {
    const rolePermissions = await RolePermission.findAll({
      include: [{
        model: Permission,
        attributes: ['name']
      }],
      where: { role, organizationId }
    });

    const permissions = rolePermissions.map(rp => rp.Permission ? rp.Permission.name : null).filter(Boolean);

    try {
      if (redisClient.status === 'ready') {
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(permissions));
      }
    } catch (err) {
      logger.warn(`Redis error saving permissions for org ${organizationId} role ${role}:`, err);
    }

    return permissions;
  } catch (error) {
    logger.error(`Error fetching permissions for org ${organizationId} role ${role}:`, error);
    throw error;
  }
}

async function getUserPermissions(userId, role, organizationId) {
  // User permissions map directly to role permissions, so we load from the role cache
  return getRolePermissions(role, organizationId);
}

async function roleHasPermission(role, permissionName, organizationId) {
  if (role === 'admin') {
    return true;
  }
  const permissions = await getRolePermissions(role, organizationId);
  return permissions.includes('all') || permissions.includes(permissionName);
}

async function userHasPermission(userId, role, permissionName, organizationId) {
  return roleHasPermission(role, permissionName, organizationId);
}

async function invalidateRoleCache(role, organizationId) {
  if (!organizationId) {
    return;
  }
  const cacheKey = `permissions:org:${organizationId}:role:${role}`;
  try {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(cacheKey);
      logger.info(`Invalidated permission cache in Redis for org ${organizationId} role: ${role}`);
    }
  } catch (error) {
    logger.warn(`Redis error invalidating cache for org ${organizationId} role ${role}:`, error);
  }
}

function invalidateUserCache(userId) {
  // No-op since we cache role-level keys in Redis
}

async function invalidateAllPermissionCache() {
  try {
    if (redisClient && redisClient.status === 'ready') {
      let cursor = '0';
      do {
        const reply = await redisClient.scan(cursor, 'MATCH', 'permissions:org:*', 'COUNT', 100);
        cursor = reply[0];
        const keys = reply[1];
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } while (cursor !== '0');
      logger.info('Invalidated all permission caches in Redis');
    }
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
