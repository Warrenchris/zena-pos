'use strict';

const logger = require('../utils/logger');

/**
 * Evaluates an authorization decision against req.authz.
 * Returns an object:
 * {
 *   allowed: boolean,
 *   status?: number,
 *   code?: string,
 *   message?: string,
 *   details?: string
 * }
 */
async function evaluateAuthorization(req, options = {}) {
  // 1. Fail-Closed Invariant: canonical authorization context must exist
  if (!req.authz) {
    logger.error('[SECURITY INVARIANT VIOLATION] req.authz is missing in authorize()', {
      url: req.originalUrl || req.url,
      method: req.method,
      requestId: req.requestId || req.id
    });
    return {
      allowed: false,
      status: 500,
      code: 'AUTHORIZATION_CONTEXT_MISSING',
      message: 'Internal authorization error: authorization context uninitialized.'
    };
  }

  // 2. Authentication check
  if (!req.user || !req.user.id) {
    return {
      allowed: false,
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required: missing user session.'
    };
  }

  const { authz } = req;

  // 3. Platform Super Admin Boundary
  if (options.platformOnly) {
    if (authz.role.effectiveRole !== 'super_admin') {
      return {
        allowed: false,
        status: 403,
        code: 'PLATFORM_SUPER_ADMIN_REQUIRED',
        message: 'Access denied: Platform super admin privileges required.'
      };
    }
    return { allowed: true };
  }

  // If caller is platform super_admin operating outside tenant scope
  if (authz.role.effectiveRole === 'super_admin') {
    // Platform super_admin is not an operational tenant role
    if (options.roles || options.role) {
      const rawRoles = options.roles || options.role;
      const allowedRoles = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
      if (!allowedRoles.includes('super_admin')) {
        return {
          allowed: false,
          status: 403,
          code: 'INSUFFICIENT_ROLE',
          message: 'Access denied: Super admin is not an authorized tenant operational role.'
        };
      }
    }
    // Super admin has universal bypass for permissions and tenant scope
    return { allowed: true };
  }

  // 4. Tenant Scope Verification
  if (!authz.tenant) {
    return {
      allowed: false,
      status: 403,
      code: 'ORGANIZATION_MEMBERSHIP_REQUIRED',
      message: 'Organization membership required.'
    };
  }

  if (authz.tenant.membershipStatus !== 'active') {
    return {
      allowed: false,
      status: 403,
      code: 'MEMBERSHIP_SUSPENDED',
      message: 'Organization membership is suspended.'
    };
  }

  // Cross-tenant tampering defense: client-supplied organizationId must match canonical context
  const untrustedOrgId = req.params?.organizationId ?? req.body?.organizationId ?? req.query?.organizationId;
  if (untrustedOrgId !== undefined && untrustedOrgId !== null && untrustedOrgId !== '') {
    if (Number(untrustedOrgId) !== Number(authz.tenant.organizationId)) {
      return {
        allowed: false,
        status: 403,
        code: 'TENANT_MISMATCH',
        message: options.tenantMismatchMessage || 'Cross-tenant access forbidden.'
      };
    }
  }

  // Governance role checks
  if (options.requireOrgOwner) {
    if (!authz.tenant.isOwner) {
      return {
        allowed: false,
        status: 403,
        code: 'ORG_OWNER_REQUIRED',
        message: 'Access denied: Organization owner privileges required.'
      };
    }
  }

  if (options.requireOrgAdmin) {
    if (!authz.tenant.isOrgAdmin) {
      return {
        allowed: false,
        status: 403,
        code: 'ORG_ADMIN_REQUIRED',
        message: 'Access denied: Organization admin or owner privileges required.'
      };
    }
  }

  // 5. Shop / Branch Scope Verification
  if (options.shopScope) {
    let targetShopId = null;

    if (options.shopScope === 'current') {
      targetShopId = authz.scope.activeShopId || req.shopId;
      if (!targetShopId) {
        return {
          allowed: false,
          status: 403,
          code: 'SHOP_CONTEXT_REQUIRED',
          message: 'Shop context required for this operation.'
        };
      }
    } else if (options.shopScope === 'param') {
      targetShopId = req.params?.shopId || req.params?.id;
    } else if (typeof options.shopScope === 'object' && options.shopScope.param) {
      targetShopId = req.params?.[options.shopScope.param];
    } else if (typeof options.shopScope === 'function') {
      try {
        targetShopId = await options.shopScope(req);
      } catch (scopeErr) {
        logger.error('[AUTHZ] Error resolving shopScope via function:', scopeErr);
        return {
          allowed: false,
          status: 403,
          code: 'SHOP_SCOPE_RESOLUTION_FAILED',
          message: 'Failed to resolve branch scope.'
        };
      }
    } else if (typeof options.shopScope === 'number' || typeof options.shopScope === 'string') {
      targetShopId = options.shopScope;
    }

    if (targetShopId !== null && targetShopId !== undefined) {
      const hasAccess = authz.scope.hasShopAccess(targetShopId);
      if (!hasAccess) {
        if (options.antiOracle || options.ownership?.antiOracle) {
          return {
            allowed: false,
            status: 404,
            code: 'NOT_FOUND',
            message: 'Resource not found.'
          };
        }
        return {
          allowed: false,
          status: 403,
          code: 'SHOP_ACCESS_DENIED',
          message: 'Access denied: You do not have access to this branch.'
        };
      }
    }

    // Defense-in-depth: if client attempts to query a specific shopId via query param
    const queryShopId = req.query?.shopId;
    if (queryShopId !== undefined && queryShopId !== null && queryShopId !== '') {
      const parsedQueryShopId = parseInt(queryShopId, 10);
      if (!authz.scope.hasShopAccess(parsedQueryShopId)) {
        return {
          allowed: false,
          status: 403,
          code: 'SHOP_ACCESS_DENIED',
          message: 'Access denied: You do not have access to this branch.'
        };
      }
    }
  }

  // 6. Role Verification
  if (options.roles || options.role) {
    const rawAllowedRoles = options.roles || options.role;
    const allowedRoles = Array.isArray(rawAllowedRoles) ? rawAllowedRoles : [rawAllowedRoles];

    const currentEffectiveRole = authz.role.effectiveRole;
    if (!allowedRoles.includes(currentEffectiveRole)) {
      return {
        allowed: false,
        status: 403,
        code: 'INSUFFICIENT_ROLE',
        message: 'Access denied: Insufficient role privileges.'
      };
    }
  }

  // 7. Permission Verification
  let permissionPassed = true;
  let missingPermName = null;

  if (options.permission) {
    if (!authz.permissions || typeof authz.permissions.has !== 'function') {
      return {
        allowed: false,
        status: 500,
        code: 'PERMISSIONS_CONTEXT_INVALID',
        message: 'Internal authorization error: permissions context invalid.'
      };
    }
    if (!authz.permissions.has(options.permission)) {
      permissionPassed = false;
      missingPermName = options.permission;
    }
  }

  if (options.permissions) {
    if (!authz.permissions || typeof authz.permissions.has !== 'function') {
      return {
        allowed: false,
        status: 500,
        code: 'PERMISSIONS_CONTEXT_INVALID',
        message: 'Internal authorization error: permissions context invalid.'
      };
    }

    if (Array.isArray(options.permissions)) {
      if (!options.permissions.every(p => authz.permissions.has(p))) {
        permissionPassed = false;
        missingPermName = options.permissions.find(p => !authz.permissions.has(p));
      }
    } else if (typeof options.permissions === 'object') {
      if (options.permissions.any && Array.isArray(options.permissions.any)) {
        if (!authz.permissions.hasAny(...options.permissions.any)) {
          permissionPassed = false;
          missingPermName = options.permissions.any.join(' | ');
        }
      }
      if (options.permissions.all && Array.isArray(options.permissions.all)) {
        if (!authz.permissions.hasAll(...options.permissions.all)) {
          permissionPassed = false;
          missingPermName = options.permissions.all.find(p => !authz.permissions.has(p));
        }
      }
    }
  }

  if (!permissionPassed) {
    return {
      allowed: false,
      status: 403,
      code: 'PERMISSION_DENIED',
      message: 'Permission denied',
      details: `User with role ${authz.role.effectiveRole} lacks required permission: ${missingPermName}`
    };
  }

  // If permission passed and no ownership check is needed, authorization succeeds
  if (!options.ownership && !options.custom) {
    return { allowed: true };
  }

  // 8. Resource Ownership & Scope Evaluation
  if (options.ownership) {
    if (typeof options.ownership === 'function') {
      try {
        const isAuthorized = await options.ownership({ authz, req });
        if (!isAuthorized) {
          if (options.antiOracle) {
            return {
              allowed: false,
              status: 404,
              code: 'NOT_FOUND',
              message: 'Resource not found.'
            };
          }
          return {
            allowed: false,
            status: 403,
            code: 'RESOURCE_ACCESS_DENIED',
            message: 'Access denied: You do not have permission to access this resource.'
          };
        }
        return { allowed: true };
      } catch (evalErr) {
        logger.error('[AUTHZ] Ownership function evaluation failed:', evalErr);
        return {
          allowed: false,
          status: 403,
          code: 'OWNERSHIP_EVALUATION_FAILED',
          message: 'Access denied: Ownership evaluation failed.'
        };
      }
    }

    if (typeof options.ownership === 'object') {
      const {
        getResource,
        getOwnerId,
        isOwner,
        managerPermission = 'manage_sales',
        ownerPermission,
        antiOracle: ownershipAntiOracle
      } = options.ownership;

      const antiOracle = ownershipAntiOracle !== undefined
        ? Boolean(ownershipAntiOracle)
        : (options.antiOracle !== undefined ? Boolean(options.antiOracle) : true);

      let resource = null;
      if (typeof getResource === 'function') {
        try {
          resource = await getResource(req);
        } catch (fetchErr) {
          logger.error('[AUTHZ] Error fetching resource for ownership check:', fetchErr);
          return {
            allowed: false,
            status: 500,
            code: 'RESOURCE_FETCH_ERROR',
            message: 'Error loading resource for authorization.'
          };
        }

        if (!resource) {
          return {
            allowed: false,
            status: 404,
            code: 'NOT_FOUND',
            message: options.ownership?.notFoundMessage || options.notFoundMessage || 'Resource not found.'
          };
        }

        // Multi-tenant isolation: resource cannot belong to another organization
        const resourceOrgId = (resource.organizationId !== undefined && resource.organizationId !== null)
          ? resource.organizationId
          : resource.Shop?.organizationId;

        if (resourceOrgId !== undefined && resourceOrgId !== null) {
          if (Number(resourceOrgId) !== Number(authz.tenant.organizationId)) {
            if (antiOracle) {
              return {
                allowed: false,
                status: 404,
                code: 'NOT_FOUND',
                message: options.ownership?.notFoundMessage || options.notFoundMessage || 'Resource not found.'
              };
            }
            return {
              allowed: false,
              status: 403,
              code: 'TENANT_MISMATCH',
              message: 'Cross-tenant access forbidden.'
            };
          }
        }

        // Branch isolation: resource cannot belong to a branch caller lacks access to
        if (resource.shopId !== undefined && resource.shopId !== null) {
          if (!authz.scope.hasShopAccess(resource.shopId)) {
            if (antiOracle) {
              return {
                allowed: false,
                status: 404,
                code: 'NOT_FOUND',
                message: 'Resource not found.'
              };
            }
            return {
              allowed: false,
              status: 403,
              code: 'SHOP_ACCESS_DENIED',
              message: 'Access denied: You do not have access to this branch.'
            };
          }
        }
      }

      let userIsOwner = false;
      try {
        if (typeof isOwner === 'function') {
          userIsOwner = Boolean(await isOwner(authz, resource, req));
        } else if (typeof getOwnerId === 'function') {
          let ownerId;
          try {
            ownerId = await getOwnerId(resource, req);
          } catch (_) {
            ownerId = await getOwnerId(req, resource);
          }
          if (ownerId === undefined && resource) {
            ownerId = await getOwnerId(req, resource);
          }
          userIsOwner = authz.ownership.isOwnerOf(ownerId);
        } else if (resource) {
          userIsOwner = authz.ownership.isOwnerOf(resource.userId) ||
                        authz.ownership.isOwnerOf(resource.employeeId) ||
                        authz.ownership.isOwnerOf(resource.cashierId) ||
                        authz.ownership.isOwnerOf(resource.createdBy);
        }
      } catch (ownerErr) {
        logger.error('[AUTHZ] Error evaluating isOwner:', ownerErr);
        return {
          allowed: false,
          status: 403,
          code: 'OWNERSHIP_EVALUATION_FAILED',
          message: 'Access denied: Ownership evaluation failed.'
        };
      }

      if (userIsOwner) {
        // If ownerPermission specified (e.g. 'view_own_sales'), verify user has it
        if (ownerPermission && !authz.permissions.has(ownerPermission)) {
          return {
            allowed: false,
            status: 403,
            code: 'PERMISSION_DENIED',
            message: `User lacks required owner permission: ${ownerPermission}`
          };
        }
        return { allowed: true };
      }

      // Not owner: check manager permission override (e.g. manager/admin/owner or managerPermission)
      const canManage = authz.ownership.canManage(null, managerPermission);
      if (!canManage) {
        if (antiOracle) {
          return {
            allowed: false,
            status: 404,
            code: 'NOT_FOUND',
            message: 'Resource not found.'
          };
        }
        return {
          allowed: false,
          status: 403,
          code: 'RESOURCE_ACCESS_DENIED',
          message: 'Access denied: You do not have permission to access this resource.'
        };
      }

      return { allowed: true };
    }
  }

  // 9. Custom Predicate Evaluation
  if (typeof options.custom === 'function') {
    try {
      const customRes = await options.custom(req, authz);
      if (typeof customRes === 'object' && customRes !== null) {
        if (!customRes.allowed) {
          return {
            allowed: false,
            status: customRes.status || 403,
            code: customRes.code || 'CUSTOM_AUTHORIZATION_DENIED',
            message: customRes.message || 'Access denied by custom policy.'
          };
        }
      } else if (!customRes) {
        return {
          allowed: false,
          status: 403,
          code: 'CUSTOM_AUTHORIZATION_DENIED',
          message: 'Access denied by custom authorization policy.'
        };
      }
      return { allowed: true };
    } catch (customErr) {
      logger.error('[AUTHZ] Custom authorization predicate threw:', customErr);
      return {
        allowed: false,
        status: 403,
        code: 'CUSTOM_AUTHORIZATION_FAILED',
        message: 'Access denied: Custom authorization error.'
      };
    }
  }

  // If permission check failed and no ownership evaluation or custom predicate rescued it
  if (!permissionPassed) {
    return {
      allowed: false,
      status: 403,
      code: 'PERMISSION_DENIED',
      message: 'Permission denied',
      details: `User with role ${authz.role.effectiveRole} lacks required permission: ${missingPermName}`
    };
  }

  return { allowed: true };
}

/**
 * Creates an Express middleware enforcing authorization rules using evaluateAuthorization.
 * Fails closed on any unexpected error.
 * 
 * @param {Object} options
 * @returns {Function} Express middleware (req, res, next)
 */
function authorize(options = {}) {
  return async (req, res, next) => {
    try {
      const decision = await evaluateAuthorization(req, options);
      if (!decision.allowed) {
        return res.status(decision.status).json({
          error: decision.message,
          code: decision.code,
          ...(decision.details ? { details: decision.details } : {})
        });
      }
      return next();
    } catch (err) {
      logger.error('[AUTHZ] Unexpected error in authorize middleware:', err);
      return res.status(500).json({
        error: 'Internal authorization error.',
        code: 'AUTHORIZATION_ERROR'
      });
    }
  };
}

authorize.evaluate = evaluateAuthorization;

module.exports = authorize;
module.exports.authorize = authorize;
module.exports.evaluateAuthorization = evaluateAuthorization;
