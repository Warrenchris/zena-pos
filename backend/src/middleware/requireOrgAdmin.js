const { OrganizationMembership, Shop, ShopAccess } = require('../models');

/**
 * Middleware: requireOrgAdmin
 * Enforces Phase 1 access control:
 * - Owner: full organization scope (all active shops).
 * - Admin: scoped strictly to shops granted in ShopAccess.
 * - Member: rejected with 403 Forbidden.
 */
async function requireOrgAdmin(req, res, next) {
  try {
    const organizationId = req.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // 1. Verify active membership with owner or admin role
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
    if (!membership || !['owner', 'admin'].includes(membership.orgRole)) {
      return res.status(403).json({ error: 'Organization analytics requires owner or admin privileges.' });
    }

    // 2. Resolve total active shops in the organization
    const totalOrgShopsCount = await Shop.count({
      where: { organizationId, active: true }
    });

    // 3. Resolve accessible shops based on two-tier delegation
    let accessibleShops = [];
    if (membership.orgRole === 'owner') {
      // Owner bypasses ShopAccess by design (Phase 1 precedent)
      accessibleShops = await Shop.findAll({
        where: { organizationId, active: true },
        attributes: ['id', 'name'],
        order: [['id', 'ASC']],
        raw: true
      });
    } else {
      // Admin is scoped strictly to ShopAccess grants (Phase 1 delegation)
      const accesses = await ShopAccess.findAll({
        where: { membershipId: membership.id },
        include: [{
          model: Shop,
          where: { organizationId, active: true },
          attributes: ['id', 'name']
        }],
        order: [[Shop, 'id', 'ASC']]
      });
      accessibleShops = accesses
        .filter(a => a.Shop)
        .map(a => ({ id: a.Shop.id, name: a.Shop.name }));
    }

    if (!accessibleShops.length) {
      return res.status(403).json({ error: 'No accessible shops found for this account.' });
    }

    // 4. Attach resolution context to request object
    req.membership = membership;
    req.isOwner = membership.orgRole === 'owner';
    req.accessibleShops = accessibleShops;
    req.accessibleShopIds = accessibleShops.map(s => s.id);
    req.totalOrgShopsCount = totalOrgShopsCount;

    next();
  } catch (error) {
    console.error('[requireOrgAdmin] Middleware error:', error);
    return res.status(500).json({ error: 'Internal authorization error.', details: error.message });
  }
}

module.exports = requireOrgAdmin;
