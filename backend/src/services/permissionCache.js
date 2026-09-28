'use strict';

const logger = require('../utils/logger');
const redisClient = require('../config/redis');

// Role normalization map: maps operational/resolved auth roles to their
// corresponding RolePermissions matrix effective role.
// Source of equivalence: ROLE_PERMISSIONS in backend/src/middleware/rolePermissions.js
// ('employee' has cashier-equivalent permissions; 'org_admin' has manager-equivalent permissions).
const ROLE_NORMALIZATION_MAP = {
  employee: 'cashier',
  org_admin: 'manager',
  cashier: 'cashier',
  manager: 'manager'
};

const CACHE_TTL = 3600; // 1 hour in seconds

async function getRolePermissions(role, organizationId) {
  if (role === 'admin') {
    return ['all'];
  }

  const effectiveRole = ROLE_NORMALIZATION_MAP[role];
  if (!effectiveRole) {
    return [];
  }

  if (!organizationId) {
    logger.warn(`getRolePermissions called without organizationId for role: ${role}`);
    return [];
  }

  const cacheKey = `permissions:org:${organizationId}:role:${effectiveRole}`;

  try {
    const cachedData = redisClient.status === 'ready' ? await redisClient.get(cacheKey) : null;
    if (cachedData) {
      logger.debug(`Permission cache HIT for org: ${organizationId}, role: ${effectiveRole}`);
      return JSON.parse(cachedData);
    }
  } catch (err) {
    logger.warn(`Redis error fetching permissions for org ${organizationId} role ${effectiveRole}, falling back to DB:`, err);
  }

  logger.debug(`Permission cache MISS for org: ${organizationId}, role: ${effectiveRole}, fetching from database`);
  try {
    // Call the seeder for this organizationId after Redis miss and before DB read
    const { ensureOrgRolePermissionsSeeded } = require('./rolePermissionSeeder');
    await ensureOrgRolePermissionsSeeded(organizationId);

    const { RolePermission, Permission } = require('../models');
    const rolePermissions = await RolePermission.findAll({
      include: [{
        model: Permission,
        attributes: ['name']
      }],
      where: { role: effectiveRole, organizationId }
    });

    const permissions = rolePermissions.map(rp => rp.Permission ? rp.Permission.name : null).filter(Boolean);

    try {
      if (redisClient.status === 'ready') {
        await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(permissions));
      }
    } catch (err) {
      logger.warn(`Redis error saving permissions for org ${organizationId} role ${effectiveRole}:`, err);
    }

    return permissions;
  } catch (error) {
    logger.error(`Error fetching permissions for org ${organizationId} role ${effectiveRole}:`, error);
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

  const effectiveRole = ROLE_NORMALIZATION_MAP[role];
  if (!effectiveRole) {
    return false;
  }

  const permissions = await getRolePermissions(effectiveRole, organizationId);
  return permissions.includes('all') || permissions.includes(permissionName);
}

async function userHasPermission(userId, role, permissionName, organizationId) {
  return roleHasPermission(role, permissionName, organizationId);
}

async function invalidateRoleCache(role, organizationId) {
  if (!organizationId) {
    return;
  }
  const effectiveRole = ROLE_NORMALIZATION_MAP[role] || role;
  const cacheKey = `permissions:org:${organizationId}:role:${effectiveRole}`;
  try {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.del(cacheKey);
      logger.info(`Invalidated permission cache in Redis for org ${organizationId} role: ${effectiveRole}`);
    }
  } catch (error) {
    logger.warn(`Redis error invalidating cache for org ${organizationId} role ${effectiveRole}:`, error);
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
