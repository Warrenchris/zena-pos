const { OrganizationMembership } = require('../models');

/**
 * Middleware: requireOrgOwner
 * Enforces Phase 1 governance rule: Subscription management and renewal
 * are strictly restricted to Organization Owners.
 */
async function requireOrgOwner(req, res, next) {
  try {
    const organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const membershipWhere = {
      organizationId,
      status: 'active'
    };

    if (req.user?.isEmployee) {
      membershipWhere.employeeId = req.user.id;
    } else {
      membershipWhere.userId = req.user?.id;
    }

    const membership = await OrganizationMembership.findOne({ where: membershipWhere });
    if (!membership || membership.orgRole !== 'owner') {
      return res.status(403).json({ error: 'Subscription renewal requires organization owner privileges.' });
    }

    req.membership = membership;
    req.organizationId = organizationId;
    next();
  } catch (err) {
    console.error('Error in requireOrgOwner middleware:', err);
    return res.status(500).json({ error: 'Failed to verify organization owner authorization.' });
  }
}

module.exports = { requireOrgOwner };
