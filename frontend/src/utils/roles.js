/**
 * Role classification helpers for the Zana frontend.
 *
 * Two tiers of access exist:
 *   - "Manager tier" (admin, manager, org_admin): sees the full admin sidebar,
 *     dashboards, reports, settings, employee management, etc.
 *   - "Cashier tier" (cashier, employee): limited POS view.
 *
 * IMPORTANT: These helpers determine UI visibility only. Actual enforcement
 * happens server-side via checkRole() / checkPermission() middleware.
 */

/**
 * Returns true if the given JWT role belongs to the manager tier.
 * Use this for UI gating that should include delegated org admins.
 *
 * Roles in this tier: admin, manager, org_admin
 */
export function isManagerTier(role) {
  return role === 'admin' || role === 'manager' || role === 'org_admin';
}

/**
 * Returns true only for the true system owner (User.role === 'admin').
 * Use this for UI gating on owner-exclusive features like granting the
 * "Administrator" position to employees or managing the Users table.
 *
 * NOTE: Do NOT use this where org_admin should also have access — use
 * isManagerTier() or check orgRole directly instead.
 */
export function isOwnerRole(role) {
  return role === 'admin';
}
