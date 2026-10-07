'use strict';

const logger = require('../utils/logger');
const tokenRevocationService = require('../services/tokenRevocationService');
const permissionCache = require('../services/permissionCache');
const {
  User,
  Employee,
  Organization,
  OrganizationMembership,
  Shop,
  ShopAccess
} = require('../models');

/**
 * Canonical Authorization Context Middleware
 * Constructs and attaches immutable req.authz to Express request.
 */
async function authzContext(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        error: 'Authentication required: missing user session.',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    const {
      id,
      isEmployee = false,
      role: tokenRole,
      shopId: tokenShopId,
      organizationId: tokenOrgId,
      jti,
      iat,
      exp,
      authzVersion: tokenAuthzVersion
    } = req.user;

    // 1. Authoritative Authorization Epoch Check
    let currentVersion = await tokenRevocationService.getAuthzVersion(id, !!isEmployee);
    const sessionVersion = tokenAuthzVersion !== undefined && tokenAuthzVersion !== null
      ? Number(tokenAuthzVersion)
      : 1;

    if (sessionVersion < currentVersion) {
      logger.warn('[AUTHZ] Stale authzVersion detected from cache', {
        id,
        isEmployee: !!isEmployee,
        sessionVersion,
        currentVersion
      });
      return res.status(401).json({
        error: 'Authorization epoch stale. Session has been invalidated.',
        code: 'AUTHZ_VERSION_STALE'
      });
    }

    // 2. Platform super_admin special case (out of tenant scope)
    if (tokenRole === 'super_admin' && !isEmployee) {
      const superAdminUser = await User.findByPk(id, {
        attributes: ['id', 'name', 'email', 'role', 'active', 'authzVersion']
      });

      if (!superAdminUser || !superAdminUser.active) {
        return res.status(401).json({
          error: 'Account is deactivated or unauthorized.',
          code: 'ACCOUNT_INACTIVE'
        });
      }

      const authoritativeDbVersion = Number(superAdminUser.authzVersion || 1);
      if (sessionVersion < authoritativeDbVersion) {
        logger.warn('[AUTHZ] Stale authzVersion detected against authoritative DB for super_admin', {
          id,
          sessionVersion,
          authoritativeDbVersion
        });
        await tokenRevocationService.setAuthzVersion(id, false, authoritativeDbVersion);
        return res.status(401).json({
          error: 'Authorization epoch stale. Session has been invalidated.',
          code: 'AUTHZ_VERSION_STALE'
        });
      }
      currentVersion = Math.max(currentVersion, authoritativeDbVersion);

      const superAdminContext = {
        identity: Object.freeze({
          id: superAdminUser.id,
          userId: superAdminUser.id,
          employeeId: null,
          isEmployee: false,
          email: superAdminUser.email,
          name: superAdminUser.name || 'Platform Super Admin'
        }),
        session: Object.freeze({
          authzVersion: currentVersion,
          iat: iat || Math.floor(Date.now() / 1000),
          exp: exp || Math.floor(Date.now() / 1000) + 7200,
          jti: jti || null
        }),
        tenant: null,
        role: Object.freeze({
          rawRole: 'super_admin',
          effectiveRole: 'super_admin'
        }),
        scope: Object.freeze({
          activeShopId: null,
          homeShopId: null,
          accessibleShopIds: [],
          hasShopAccess: () => true
        }),
        permissions: Object.freeze({
          granted: new Set(['*']),
          has: () => true,
          hasAny: () => true,
          hasAll: () => true
        }),
        ownership: Object.freeze({
          isOwnerOf: () => true,
          canManage: () => true
        })
      };

      req.authz = Object.freeze(superAdminContext);
      req.user = {
        ...req.user,
        role: 'super_admin',
        authzVersion: currentVersion
      };
      return next();
    }

    // 3. Hydrate User or Employee Entity
    let entityUser = null;
    let entityEmployee = null;
    let rawRole = 'cashier';
    let effectiveRole = null;
    let homeShopId = null;
    let email = '';
    let name = '';

    if (isEmployee) {
      entityEmployee = await Employee.findByPk(id, {
        attributes: ['id', 'firstName', 'lastName', 'email', 'position', 'status', 'shopId', 'authzVersion']
      });
      if (!entityEmployee || entityEmployee.status !== 'active') {
        return res.status(401).json({
          error: 'Account is deactivated or terminated.',
          code: 'ACCOUNT_INACTIVE'
        });
      }
      const authoritativeDbVersion = Number(entityEmployee.authzVersion || 1);
      if (sessionVersion < authoritativeDbVersion) {
        logger.warn('[AUTHZ] Stale authzVersion detected against authoritative DB for employee', {
          id,
          sessionVersion,
          authoritativeDbVersion
        });
        await tokenRevocationService.setAuthzVersion(id, true, authoritativeDbVersion);
        return res.status(401).json({
          error: 'Authorization epoch stale. Session has been invalidated.',
          code: 'AUTHZ_VERSION_STALE'
        });
      }
      currentVersion = Math.max(currentVersion, authoritativeDbVersion);

      rawRole = entityEmployee.position || 'cashier';
      homeShopId = entityEmployee.shopId;
      email = entityEmployee.email;
      name = `${entityEmployee.firstName || ''} ${entityEmployee.lastName || ''}`.trim() || entityEmployee.email;
    } else {
      entityUser = await User.findByPk(id, {
        attributes: ['id', 'name', 'email', 'role', 'active', 'shopId', 'authzVersion']
      });
      if (!entityUser || !entityUser.active) {
        return res.status(401).json({
          error: 'Account is deactivated or terminated.',
          code: 'ACCOUNT_INACTIVE'
        });
      }
      const authoritativeDbVersion = Number(entityUser.authzVersion || 1);
      if (sessionVersion < authoritativeDbVersion) {
        logger.warn('[AUTHZ] Stale authzVersion detected against authoritative DB for user', {
          id,
          sessionVersion,
          authoritativeDbVersion
        });
        await tokenRevocationService.setAuthzVersion(id, false, authoritativeDbVersion);
        return res.status(401).json({
          error: 'Authorization epoch stale. Session has been invalidated.',
          code: 'AUTHZ_VERSION_STALE'
        });
      }
      currentVersion = Math.max(currentVersion, authoritativeDbVersion);

      rawRole = entityUser.role || 'cashier';
      homeShopId = entityUser.shopId;
      email = entityUser.email;
      name = entityUser.name || entityUser.email;
    }

    // 4. Resolve Organization Membership
    let membership = await OrganizationMembership.findOne({
      where: isEmployee ? { employeeId: id } : { userId: id }
    });

    // Backward compatibility fallback for legacy setups where membership was not explicitly created
    if (!membership) {
      let resolvedOrgId = req.organizationId || tokenOrgId;
      if (!resolvedOrgId && homeShopId) {
        const homeShop = await Shop.findByPk(homeShopId, { attributes: ['organizationId'] });
        resolvedOrgId = homeShop?.organizationId;
      }

      if (resolvedOrgId) {
        const fallbackOrgRole = (!isEmployee && rawRole === 'admin') ? 'owner' : 'member';
        [membership] = await OrganizationMembership.findOrCreate({
          where: isEmployee
            ? { organizationId: resolvedOrgId, employeeId: id }
            : { organizationId: resolvedOrgId, userId: id },
          defaults: {
            organizationId: resolvedOrgId,
            userId: isEmployee ? null : id,
            employeeId: isEmployee ? id : null,
            orgRole: fallbackOrgRole,
            status: 'active'
          }
        });
      }
    }

    if (!membership) {
      return res.status(403).json({
        error: 'Organization membership required.',
        code: 'ORGANIZATION_MEMBERSHIP_REQUIRED'
      });
    }

    if (membership.status !== 'active') {
      return res.status(403).json({
        error: 'Organization membership is suspended.',
        code: 'MEMBERSHIP_SUSPENDED'
      });
    }

    // Cross-tenant mismatch verification
    const targetOrgId = req.organizationId || tokenOrgId;
    if (targetOrgId && Number(targetOrgId) !== Number(membership.organizationId)) {
      return res.status(403).json({
        error: 'Cross-tenant access forbidden.',
        code: 'TENANT_MISMATCH'
      });
    }

    // 5. Hydrate Organization
    const organization = await Organization.findByPk(membership.organizationId, {
      attributes: ['id', 'name', 'status']
    });
    if (!organization) {
      return res.status(403).json({
        error: 'Organization not found.',
        code: 'ORGANIZATION_NOT_FOUND'
      });
    }

    const orgStatus = await tokenRevocationService.getOrgStatus(organization.id);
    if (orgStatus === 'deleted') {
      return res.status(403).json({
        error: 'Organization has been deactivated or deleted.',
        code: 'ORGANIZATION_DELETED',
        isDeleted: true
      });
    }

    if ((orgStatus === 'suspended' || orgStatus === 'canceled') && membership.orgRole !== 'owner') {
      return res.status(403).json({
        error: 'Organization subscription is suspended. Contact the organization owner for renewal.',
        code: 'ORGANIZATION_SUSPENDED',
        isSuspended: true
      });
    }

    // 6. Resolve Roles (Governance & Operational)
    const orgRole = membership.orgRole; // 'owner' | 'admin' | 'member' | 'billing_admin'
    if (tokenRole === 'customer') {
      effectiveRole = 'customer';
    } else if (orgRole === 'owner') {
      effectiveRole = 'admin';
    } else if (orgRole === 'admin') {
      effectiveRole = 'org_admin';
    } else if (orgRole === 'billing_admin') {
      effectiveRole = 'billing_admin';
    } else if (orgRole === 'member') {
      const lowerRaw = String(rawRole).toLowerCase();
      if (lowerRaw === 'manager') {
        effectiveRole = 'manager';
      } else {
        effectiveRole = 'cashier';
      }
    } else {
      effectiveRole = String(rawRole).toLowerCase();
    }

    // 7. Resolve Shop Access & Scope
    const activeShopId = req.shopId || tokenShopId || null;
    let accessibleShopIds = [];

    if (orgRole === 'owner') {
      // Universal implicit bypass across all organization branches
      const orgShops = await Shop.findAll({
        where: { organizationId: organization.id, active: true },
        attributes: ['id']
      });
      accessibleShopIds = orgShops.map(s => s.id);
    } else {
      const accesses = await ShopAccess.findAll({
        where: { membershipId: membership.id },
        attributes: ['shopId']
      });
      accessibleShopIds = accesses.map(a => a.shopId).filter(Boolean);
      if (homeShopId && !accessibleShopIds.includes(homeShopId)) {
        accessibleShopIds.push(homeShopId);
      }
    }

    const hasShopAccess = (targetShopId) => {
      if (targetShopId === null || targetShopId === undefined) return false;
      const numId = Number(targetShopId);
      return accessibleShopIds.includes(numId);
    };

    // 8. Resolve Permissions
    let permissionList = [];
    if (effectiveRole === 'admin' || orgRole === 'owner') {
      permissionList = ['all'];
    } else if (effectiveRole === 'billing_admin') {
      permissionList = ['view_invoices', 'manage_billing'];
    } else {
      try {
        permissionList = await permissionCache.getRolePermissions(effectiveRole, organization.id);
      } catch (err) {
        logger.warn(`[AUTHZ] Error getting permissions for ${effectiveRole}:`, err.message);
      }
      if (!permissionList || permissionList.length === 0) {
        const { ROLE_PERMISSIONS } = require('./rolePermissions');
        permissionList = ROLE_PERMISSIONS[effectiveRole] || [];
      }
    }

    const grantedSet = new Set(permissionList);
    const hasPermission = (p) => {
      if (!p) return false;
      return grantedSet.has('all') || grantedSet.has('*') || grantedSet.has(p);
    };

    const permissionsHelper = {
      granted: grantedSet,
      has: hasPermission,
      hasAny: (...perms) => {
        if (grantedSet.has('all') || grantedSet.has('*')) return true;
        return perms.some(p => grantedSet.has(p));
      },
      hasAll: (...perms) => {
        if (grantedSet.has('all') || grantedSet.has('*')) return true;
        return perms.every(p => grantedSet.has(p));
      }
    };

    // 9. Ownership & Manager Override Helper
    const identityId = isEmployee ? entityEmployee.id : entityUser.id;
    const ownershipHelper = {
      isOwnerOf: (resourceOwnerId) => {
        if (resourceOwnerId === null || resourceOwnerId === undefined) return false;
        return String(resourceOwnerId) === String(identityId);
      },
      canManage: (resourceOwnerId, managerPermission = 'manage_sales') => {
        if (ownershipHelper.isOwnerOf(resourceOwnerId)) return true;
        if (orgRole === 'owner' || effectiveRole === 'admin') return true;
        if (effectiveRole === 'manager' || effectiveRole === 'org_admin') return true;
        return permissionsHelper.has(managerPermission);
      }
    };

    // 10. Construct Canonical Authorization Context
    const authz = {
      identity: Object.freeze({
        id: identityId,
        userId: isEmployee ? null : entityUser.id,
        employeeId: isEmployee ? entityEmployee.id : null,
        isEmployee: !!isEmployee,
        email,
        name
      }),
      session: Object.freeze({
        authzVersion: currentVersion,
        iat: iat || Math.floor(Date.now() / 1000),
        exp: exp || null,
        jti: jti || null
      }),
      tenant: Object.freeze({
        organizationId: organization.id,
        organizationName: organization.name,
        organizationStatus: orgStatus,
        membershipId: membership.id,
        orgRole,
        membershipStatus: membership.status,
        isOwner: orgRole === 'owner',
        isOrgAdmin: orgRole === 'owner' || orgRole === 'admin'
      }),
      role: Object.freeze({
        rawRole,
        effectiveRole
      }),
      scope: Object.freeze({
        activeShopId,
        homeShopId,
        accessibleShopIds,
        hasShopAccess
      }),
      permissions: Object.freeze(permissionsHelper),
      ownership: Object.freeze(ownershipHelper)
    };

    req.authz = Object.freeze(authz);

    // 11. Synchronize Backward-Compatibility Request Properties
    req.user = {
      ...req.user,
      id: identityId,
      email,
      name,
      role: effectiveRole,
      orgRole,
      shopId: activeShopId,
      organizationId: organization.id,
      isEmployee: !!isEmployee,
      authzVersion: currentVersion
    };
    req.shopId = activeShopId;
    req.organizationId = organization.id;
    req.membership = membership;

    next();
  } catch (error) {
    logger.error('[AUTHZ] Error initializing canonical authorization context:',
      { message: error.message, stack: error.stack });
    return res.status(500).json({
      error: 'Internal authorization error.',
      code: 'AUTHORIZATION_CONTEXT_ERROR'
    });
  }
}

module.exports = authzContext;
module.exports.authzContext = authzContext;
