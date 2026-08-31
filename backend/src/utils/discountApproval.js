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
 * Determines whether any discount in this sale (cart-level or any item)
 * requires manager approval, and if so, verifies the supplied credential
 * against the real, hashed password on the User record.
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
  const cartNeedsApproval = discountRequiresApproval(cartDiscountType, cartDiscountValue);
  const anyItemNeedsApproval = items.some(item =>
    discountRequiresApproval(item.discountType, item.discountValue)
  );

  if (!cartNeedsApproval && !anyItemNeedsApproval) {
    return null;
  }

  // If the authenticated user making the request is already an active manager or admin,
  // their own authenticated session authorizes the discount.
  if (user && !user.isEmployee && ['manager', 'admin'].includes(user.role)) {
    return user.name || user.email || 'Admin/Manager';
  }

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

  const approvingManager = await User.findOne({
    where: { id: managerApprovalId, shopId, active: true }
  });

  if (!approvingManager || !['manager', 'admin'].includes(approvingManager.role)) {
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

  return approvingManager.name || approvingManager.email;
}

module.exports = {
  DISCOUNT_APPROVAL_PERCENT_THRESHOLD,
  DISCOUNT_APPROVAL_FIXED_THRESHOLD,
  discountRequiresApproval,
  verifyDiscountApprovalIfNeeded
};
