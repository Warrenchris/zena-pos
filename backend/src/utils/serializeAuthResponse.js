'use strict';

/**
 * Shared serializer for authentication payloads across register, login,
 * getProfile, and switchShop endpoints.
 *
 * Guarantees a consistent, authoritative response structure:
 * {
 *   user: { id, name, email, role, orgRole, shopId, organizationId, shop },
 *   shop: { id, name, address, phone, kraPin, organizationId } | null
 * }
 */
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
    role: isEmployee ? 'employee' : (entity?.role || 'admin'),
    orgRole: resolvedOrgRole,
    shopId: entity?.shopId || serializedShop?.id || null,
    organizationId: resolvedOrgId,
    shop: serializedShop,
    ...(subscriptionStatus ? { subscriptionStatus } : {})
  };

  return {
    user: serializedUser,
    shop: serializedShop
  };
}

module.exports = {
  buildAuthPayload
};
