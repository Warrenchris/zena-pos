const User = require('../models/User');

/**
 * Shared discount-authorization rules and verification, used by every
 * sale-creation path (single-payment sales, split-payment sales, and any
 * future ones). This exists specifically so the threshold/credential check
 * lives in exactly one place — the earlier bug in this app was two separate
 * sales controllers silently drifting out of sync on stock-locking logic;
 * duplicating this security check across services would repeat that mistake
 * with a worse consequence (a bypassable discount, not just a code smell).
 */

// Mirrors the thresholds enforced client-side in DiscountModal.jsx. The
// client-side check is a UX nicety only; this server-side check is what
// actually prevents an above-threshold discount with a fabricated approver.
const DISCOUNT_APPROVAL_PERCENT_THRESHOLD = 10;
const DISCOUNT_APPROVAL_FIXED_THRESHOLD = 50;

function discountRequiresApproval(discountType, discountValue) {
  const val = parseFloat(discountValue || 0);
  if (!discountType || val <= 0) return false;
  if (discountType === 'percentage') return val > DISCOUNT_APPROVAL_PERCENT_THRESHOLD;
  return val > DISCOUNT_APPROVAL_FIXED_THRESHOLD;
}

/**
 * Validates discount values to prevent negative, excessive, or malformed inputs.
 */
function validateDiscountBounds(discountType, discountValue) {
  if (discountValue === undefined || discountValue === null) return;
  const val = parseFloat(discountValue);
  if (isNaN(val)) {
    const err = new Error('Malformed discount amount.');
    err.statusCode = 400;
    throw err;
  }
  if (val < 0) {
    const err = new Error('Discount value cannot be negative.');
    err.statusCode = 400;
    throw err;
  }
  if (discountType === 'percentage' && val > 100) {
    const err = new Error('Discount percentage cannot exceed 100%.');
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Determines whether any discount in this sale (cart-level or any item)
 * requires manager approval, and if so, verifies the supplied credential
 * against the real, hashed password on the User or Employee record.
 *
 * @returns {Promise<string|null>} the verified approver's display name, or
 *   null if no discount in this sale required approval.
 * @throws {Error} with .statusCode set, if approval was required but the
 *   credential is missing, the user isn't an active manager/admin, or the
 *   password is wrong.
 */
async function verifyDiscountApprovalIfNeeded({
  shopId,
  user,
  cartDiscountType,
  cartDiscountValue,
  items = [],
  managerApprovalId,
  managerPassword
}) {
  // 1. Validate numerical and percentage bounds on cart and all items
  validateDiscountBounds(cartDiscountType, cartDiscountValue);
  for (const item of items) {
    validateDiscountBounds(item.discountType, item.discountValue);
  }

  const cartNeedsApproval = discountRequiresApproval(cartDiscountType, cartDiscountValue);
  const anyItemNeedsApproval = items.some(item =>
    discountRequiresApproval(item.discountType, item.discountValue)
  );

  if (!cartNeedsApproval && !anyItemNeedsApproval) {
    return null;
  }

  // 2. If caller is already an authorized manager, admin, or org_admin, their authenticated session authorizes it
  const effectiveRole = user?.role || user?.effectiveRole;
  if (user && ['manager', 'admin', 'org_admin'].includes(effectiveRole)) {
    return user.name || user.email || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Admin/Manager';
  }

  // 3. Otherwise, manager approval credentials are required
  if (!managerApprovalId) {
    const err = new Error('This discount exceeds the unapproved threshold and requires manager approval.');
    err.statusCode = 403;
    throw err;
  }
  if (!managerPassword || typeof managerPassword !== 'string' || managerPassword.trim() === '') {
    const err = new Error('Manager password credential is required to authorize this discount.');
    err.statusCode = 401;
    throw err;
  }

  // 4. Resolve approving manager from User (platform) or Employee (shop staff)
  let approvingManager = await User.findOne({
    where: { id: managerApprovalId, shopId, active: true }
  });
  let managerRole = approvingManager?.role;

  if (!approvingManager) {
    const Employee = require('../models/Employee');
    const emp = await Employee.findOne({
      where: { id: managerApprovalId, shopId, status: 'active' }
    });
    if (emp) {
      approvingManager = emp;
      managerRole = emp.position?.toLowerCase();
    }
  }

  if (!approvingManager || !['manager', 'admin'].includes(managerRole)) {
    const err = new Error('Selected approving user is not an active Manager or Admin.');
    err.statusCode = 403;
    throw err;
  }

  const isValidPassword = await approvingManager.validatePassword(managerPassword);
  if (!isValidPassword) {
    const err = new Error(`Invalid password for approving manager ${approvingManager.name || approvingManager.email}.`);
    err.statusCode = 401;
    throw err;
  }

  return approvingManager.name || approvingManager.email || `${approvingManager.firstName || ''} ${approvingManager.lastName || ''}`.trim() || 'Manager';
}

module.exports = {
  DISCOUNT_APPROVAL_PERCENT_THRESHOLD,
  DISCOUNT_APPROVAL_FIXED_THRESHOLD,
  discountRequiresApproval,
  validateDiscountBounds,
  verifyDiscountApprovalIfNeeded
};
