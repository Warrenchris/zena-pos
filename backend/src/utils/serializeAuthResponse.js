'use strict';

/**
 * Shared serializer for authentication payloads across register, login,
 * getProfile, and switchShop endpoints.
 *
 * Active vs default branch (do not mix these up):
 *   req.shopId / JWT `shopId`  = the currently active branch (switchShop only
 *                                remints the token; it never writes the DB)
 *   User.shopId / Employee.shopId = original/default home branch in the DB
 * They are NOT interchangeable. Always prefer the resolved `shop` argument
 * (active branch) over entity.shopId when building the response.
 *
 * Guarantees a consistent, authoritative response structure:
 * {
 *   user: { id, name, email, role, orgRole, shopId, organizationId, shop },
 *   shop: { id, name, address, phone, kraPin, organizationId } | null
 * }
 */

// Employee.position is free-text (historically a job title, not an ACL).
// staffCreationService.positionToOrgRole already maps position 'admin' →
// orgRole 'admin' for org-layer routes (members, insights, branch create).
// Mapping the same string to JWT role 'admin' would ALSO open every
// checkRole(['admin']) route (staff writes, catalog/customer/sale deletes,
// cache admin, etc.) with no extra allow-list. 2026-09-22 investigation:
// never map Employee.position to JWT 'admin' under any spelling/casing.
//
// 2026-09-27: Introduced 'org_admin' as a resolved JWT role for employees
// with position='admin' AND orgRole='admin'. Gets manager-equivalent
// permissions in ROLE_PERMISSIONS without the unscoped 'admin' power.
const AUTH_ROLES = new Set(['cashier', 'manager']);

function resolveAuthRole(value, orgRole = null) {
  const role = String(value || '').trim().toLowerCase();
  if (AUTH_ROLES.has(role)) return role;
  // Delegated org admin: position 'admin' + orgRole 'admin' → 'org_admin'.
  // Never resolves to literal 'admin' — that is reserved for User.role owners.
  if (role === 'admin' && orgRole === 'admin') return 'org_admin';
  return 'employee';
}

function buildAuthPayload({
  user = null,
  employee = null,
  shop = null,
  orgRole = null,
  organizationId = null,
  subscriptionStatus = null
}) {
  const entity = employee || user;
  const isEmployee = Boolean(employee) || Boolean(user?.isEmployee) || user?.role === 'employee';

  const resolvedOrgId =
    organizationId ||
    shop?.organizationId ||
    entity?.organizationId ||
    entity?.Shop?.organizationId ||
    null;

  const resolvedOrgRole = orgRole || (isEmployee ? 'member' : null);

  const resolvedShop = shop || entity?.Shop || null;
  const serializedShop = resolvedShop
    ? {
        id: resolvedShop.id,
        name: resolvedShop.name,
        address: resolvedShop.address || null,
        phone: resolvedShop.phone || null,
        kraPin: resolvedShop.kraPin || null,
        organizationId: resolvedOrgId || resolvedShop.organizationId || null
      }
    : null;

  const serializedUser = {
    id: entity ? entity.id : null,
    name: employee
      ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim()
      : (entity?.name || ''),
    email: entity?.email || '',
    // Users keep their User.role (including 'admin'). Employees go through
    // resolveAuthRole, which never emits JWT/payload 'admin' from position.
    // orgRole is forwarded so position='admin' + orgRole='admin' → 'org_admin'.
    role: isEmployee
      ? resolveAuthRole(entity?.position || entity?.role, resolvedOrgRole)
      : (entity?.role || 'employee'),
    orgRole: resolvedOrgRole,
    // serializedShop is the *active* branch (may differ from entity.shopId
    // after switchShop). Prefer it so user.shopId always agrees with user.shop.id.
    shopId: serializedShop?.id || entity?.shopId || null,
    organizationId: resolvedOrgId,
    shop: serializedShop,
    emailVerified: isEmployee ? true : Boolean(entity?.emailVerifiedAt || entity?.emailVerified),
    createdAt: entity?.createdAt || null,
    ...(subscriptionStatus ? { subscriptionStatus } : {})
  };

  return {
    user: serializedUser,
    shop: serializedShop
  };
}

module.exports = {
  buildAuthPayload,
  resolveAuthRole
};
