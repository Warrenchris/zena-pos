'use strict';

const {
  OrganizationMembership,
  Shop,
  ShopAccess,
  User,
  Employee
} = require('../models');

/**
 * Tenant-Wide Member Management (P1-04)
 * GET /api/organizations/members
 *
 * Provides a tenant-wide representation of:
 * - user / employee
 * - organization role (owner, admin, member)
 * - operational role (admin, manager, cashier)
 * - status (active, suspended)
 * - accessible shops
 * - default shop
 *
 * Scoped strictly to the caller's organization.
 */
exports.getOrganizationMembers = async (req, res) => {
  try {
    const orgId = req.organizationId
      ? parseInt(req.organizationId, 10)
      : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // Verify caller has owner or admin role in this organization
    const callerMembershipWhere = {
      organizationId: orgId,
      status: 'active'
    };
    if (req.user.isEmployee) {
      callerMembershipWhere.employeeId = req.user.id;
    } else {
      callerMembershipWhere.userId = req.user.id;
    }

    const callerMembership = await OrganizationMembership.findOne({ where: callerMembershipWhere });
    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.orgRole)) {
      return res.status(403).json({ error: 'Access denied: requires organization owner or admin role.' });
    }

    // All active shops in this organization for owner implicit access resolution
    const allOrgShops = await Shop.findAll({
      where: { organizationId: orgId, active: true },
      attributes: ['id', 'name'],
      order: [['id', 'ASC']]
    });
    const shopMap = new Map(allOrgShops.map(s => [s.id, s.name]));

    // Query all memberships strictly for this organization
    const memberships = await OrganizationMembership.findAll({
      where: { organizationId: orgId },
      include: [
        {
          model: User,
          attributes: ['id', 'name', 'email', 'role', 'active', 'shopId']
        },
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email', 'position', 'status', 'shopId']
        },
        {
          model: ShopAccess,
          include: [{
            model: Shop,
            where: { organizationId: orgId },
            attributes: ['id', 'name'],
            required: false
          }]
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    const members = memberships.map((m) => {
      const isEmployeeMember = Boolean(m.employeeId && m.Employee);
      const user = m.User;
      const employee = m.Employee;

      const memberId = isEmployeeMember ? employee.id : user?.id;
      const name = isEmployeeMember
        ? `${employee.firstName} ${employee.lastName}`.trim()
        : user?.name || 'Unknown';
      const email = isEmployeeMember ? employee.email : user?.email;
      const operationalRole = isEmployeeMember ? employee.position : user?.role || 'user';
      const defaultShopId = isEmployeeMember ? employee.shopId : user?.shopId;
      const defaultShopName = defaultShopId ? shopMap.get(defaultShopId) || null : null;

      let accessibleShops = [];
      if (m.orgRole === 'owner') {
        // Owner has implicit access to all org shops
        accessibleShops = allOrgShops.map(s => ({
          id: s.id,
          name: s.name,
          isDefault: s.id === defaultShopId
        }));
      } else {
        // Explicit ShopAccess grants
        const explicitShops = (m.ShopAccesses || [])
          .filter(sa => sa.Shop)
          .map(sa => ({
            id: sa.Shop.id,
            name: sa.Shop.name,
            isDefault: Boolean(sa.isDefault || sa.Shop.id === defaultShopId)
          }));

        // Include home shop if not already in list
        if (defaultShopId && !explicitShops.some(s => s.id === defaultShopId)) {
          explicitShops.unshift({
            id: defaultShopId,
            name: defaultShopName || 'Home Branch',
            isDefault: true
          });
        }
        accessibleShops = explicitShops;
      }

      return {
        membershipId: m.id,
        type: isEmployeeMember ? 'employee' : 'user',
        id: memberId,
        name,
        email,
        orgRole: m.orgRole,
        operationalRole,
        status: m.status,
        defaultShop: defaultShopId ? { id: defaultShopId, name: defaultShopName } : null,
        accessibleShops
      };
    });

    return res.json({
      organizationId: orgId,
      totalMembers: members.length,
      members
    });
  } catch (error) {
    console.error('Error in getOrganizationMembers:', error);
    return res.status(500).json({ error: 'Failed to fetch organization members', details: error.message });
  }
};
