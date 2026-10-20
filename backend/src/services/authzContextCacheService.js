'use strict';

const redisClient = require('../config/redis');
const logger = require('../utils/logger');

function isCacheEnabled() {
  return process.env.AUTHZ_CONTEXT_CACHE_ENABLED === 'true';
}

function getCacheTtl() {
  const raw = process.env.AUTHZ_CONTEXT_CACHE_TTL_SECONDS;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 45;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45;
}

function getCacheKey({ tokenRole, tokenOrgId, id, isEmployee, currentVersion }) {
  if (tokenRole === 'super_admin' && !isEmployee) {
    return `authz_ctx:global:u:${id}:v:${currentVersion}`;
  }
  if (tokenOrgId === undefined || tokenOrgId === null || String(tokenOrgId).trim() === '') {
    return null;
  }
  const kind = isEmployee ? 'e' : 'u';
  return `authz_ctx:org:${tokenOrgId}:${kind}:${id}:v:${currentVersion}`;
}

async function getCachedActorContext(key) {
  if (!isCacheEnabled() || !key) return null;
  if (!redisClient || redisClient.status !== 'ready') return null;

  try {
    const raw = await redisClient.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    logger.warn('[AUTHZ-CACHE] Redis error reading actor context:', err.message);
    return null;
  }
}

async function setCachedActorContext(key, payload, ttl = getCacheTtl()) {
  if (!isCacheEnabled() || !key || !payload) return;
  if (!redisClient || redisClient.status !== 'ready') return;

  try {
    await redisClient.setex(key, ttl, JSON.stringify(payload));
  } catch (err) {
    logger.warn('[AUTHZ-CACHE] Redis error writing actor context:', err.message);
  }
}

function validateCachedPayload(cached, { id, isEmployee, currentVersion, tokenOrgId, tokenRole }) {
  if (!cached || typeof cached !== 'object') return false;
  if (cached.schemaVersion !== 1) return false;
  if (Number(cached.authzVersion) !== Number(currentVersion)) return false;
  if (String(cached.actorId) !== String(id)) return false;

  const expectedKind = isEmployee ? 'e' : 'u';
  if (cached.actorKind !== expectedKind) return false;

  if (!cached.identity || !cached.role || !cached.scope) return false;

  if (tokenRole === 'super_admin' && !isEmployee) {
    return Boolean(cached.isSuperAdmin);
  }

  if (!cached.tenant || !cached.membership) return false;
  if (cached.tenant.organizationId === undefined || cached.tenant.organizationId === null) return false;

  if (tokenOrgId !== undefined && tokenOrgId !== null) {
    if (Number(cached.tenant.organizationId) !== Number(tokenOrgId)) {
      return false;
    }
  }

  return true;
}

function buildActorPayload({
  id,
  isEmployee,
  currentVersion,
  entityUser,
  entityEmployee,
  rawRole,
  effectiveRole,
  organization,
  membership,
  homeShopId,
  accessibleShopIds,
  email,
  name
}) {
  const isOwner = membership.orgRole === 'owner';
  return {
    schemaVersion: 1,
    actorKind: isEmployee ? 'e' : 'u',
    actorId: id,
    authzVersion: currentVersion,
    identity: {
      id,
      userId: isEmployee ? null : entityUser.id,
      employeeId: isEmployee ? entityEmployee.id : null,
      isEmployee: Boolean(isEmployee),
      email,
      name
    },
    role: {
      rawRole,
      effectiveRole
    },
    tenant: {
      organizationId: organization.id,
      organizationName: organization.name,
      membershipId: membership.id,
      orgRole: membership.orgRole,
      membershipStatus: membership.status,
      isOwner,
      isOrgAdmin: isOwner || membership.orgRole === 'admin'
    },
    membership: {
      id: membership.id,
      organizationId: membership.organizationId,
      userId: membership.userId,
      employeeId: membership.employeeId,
      orgRole: membership.orgRole,
      status: membership.status
    },
    scope: {
      homeShopId,
      memberAccessibleShopIds: isOwner ? null : accessibleShopIds
    },
    isSuperAdmin: false
  };
}

function buildSuperAdminPayload({ id, currentVersion, superAdminUser }) {
  return {
    schemaVersion: 1,
    actorKind: 'u',
    actorId: id,
    authzVersion: currentVersion,
    identity: {
      id,
      userId: id,
      employeeId: null,
      isEmployee: false,
      email: superAdminUser.email,
      name: superAdminUser.name || 'Platform Super Admin'
    },
    role: {
      rawRole: 'super_admin',
      effectiveRole: 'super_admin'
    },
    tenant: null,
    membership: null,
    scope: {
      homeShopId: null,
      memberAccessibleShopIds: null
    },
    isSuperAdmin: true
  };
}

async function invalidateOrgActorContexts(organizationId) {
  if (!organizationId) return 0;
  if (!redisClient || redisClient.status !== 'ready') return 0;

  const pattern = `authz_ctx:org:${organizationId}:*`;
  let cursor = '0';
  let totalDeleted = 0;

  try {
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (Array.isArray(keys) && keys.length > 0) {
        await redisClient.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn(`[AUTHZ-CACHE] Redis scanAndDelete failed for ${pattern}:`, err.message);
  }

  return totalDeleted;
}

module.exports = {
  isCacheEnabled,
  getCacheTtl,
  getCacheKey,
  getCachedActorContext,
  setCachedActorContext,
  validateCachedPayload,
  buildActorPayload,
  buildSuperAdminPayload,
  invalidateOrgActorContexts
};

