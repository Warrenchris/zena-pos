const archiver = require('archiver');
const {
  Organization,
  OrganizationMembership,
  Shop,
  ShopAccess,
  User,
  Employee,
  Product,
  Customer,
  Sale,
  SaleItem,
  Subscription,
  SubscriptionInvoice,
  ActivityLog
} = require('../models');
const tokenRevocationService = require('../services/tokenRevocationService');
const billingService = require('../services/billingService');

function arrayToCsv(headers, rows) {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const headerLine = headers.map(h => escapeCell(h)).join(',');
  const rowLines = (rows || []).map(row => headers.map(h => escapeCell(row[h])).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

/**
 * Owner-Only Organization Data Export (7D)
 * GET /api/organizations/export
 *
 * Packages tenant-isolated data into a zipped bundle of CSVs.
 */
exports.exportOrganizationData = async (req, res) => {
  try {
    const orgId = req.organizationId
      ? parseInt(req.organizationId, 10)
      : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // Strictly enforce that only organization owners can export organization data
    const membershipWhere = {
      organizationId: orgId,
      status: 'active'
    };
    if (req.user.isEmployee) {
      membershipWhere.employeeId = req.user.id;
    } else {
      membershipWhere.userId = req.user.id;
    }

    const callerMembership = await OrganizationMembership.findOne({ where: membershipWhere });
    if (!callerMembership || callerMembership.orgRole !== 'owner') {
      return res.status(403).json({ error: 'Access denied: Only organization owners can export organization data.' });
    }

    const org = await Organization.findByPk(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    // Fetch all branches under this organization
    const shops = await Shop.findAll({ where: { organizationId: orgId }, raw: true });
    const shopIds = shops.map(s => s.id);

    // Fetch products, customers, sales, and billing invoices scoped strictly to this organization
    const [products, customers, sales, invoices] = await Promise.all([
      Product.findAll({ where: { organizationId: orgId }, raw: true }),
      shopIds.length ? Customer.findAll({ where: { shopId: shopIds }, raw: true }) : [],
      shopIds.length ? Sale.findAll({ where: { shopId: shopIds }, raw: true }) : [],
      SubscriptionInvoice.findAll({ where: { organizationId: orgId }, raw: true })
    ]);

    const saleIds = sales.map(s => s.id);
    const saleItems = saleIds.length ? await SaleItem.findAll({ where: { saleId: saleIds }, raw: true }) : [];

    // Audit log before streaming
    try {
      if (shopIds.length && req.user?.id && !req.user.isEmployee) {
        await ActivityLog.create({
          shopId: shopIds[0],
          userId: req.user.id,
          action: 'ORGANIZATION_DATA_EXPORTED',
          entity: 'Organization',
          entityId: String(orgId),
          details: `Organization "${org.name}" data exported by owner`
        });
      }
    } catch (logErr) {
      console.error('Failed to log data export activity:', logErr);
    }

    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="zana-pos-export-org-${orgId}-${Date.now()}.zip"`);

    archive.pipe(res);

    archive.append(
      arrayToCsv(['id', 'name', 'address', 'phone', 'kraPin', 'registrationNumber', 'active', 'createdAt'], shops),
      { name: 'shops.csv' }
    );
    archive.append(
      arrayToCsv(['id', 'organizationId', 'shopId', 'name', 'sku', 'barcode', 'price', 'cost', 'taxCategory', 'active', 'createdAt'], products),
      { name: 'products.csv' }
    );
    archive.append(
      arrayToCsv(['id', 'shopId', 'name', 'email', 'phone', 'address', 'balance', 'loyaltyPoints', 'createdAt'], customers),
      { name: 'customers.csv' }
    );
    archive.append(
      arrayToCsv(['id', 'shopId', 'invoiceNumber', 'customerId', 'subtotal', 'tax', 'total', 'paymentMethod', 'saleStatus', 'createdAt'], sales),
      { name: 'sales.csv' }
    );
    archive.append(
      arrayToCsv(['id', 'saleId', 'shopId', 'productId', 'quantity', 'unitPrice', 'price', 'subtotal', 'taxRate', 'taxAmount', 'taxCategory', 'createdAt'], saleItems),
      { name: 'sale_items.csv' }
    );
    archive.append(
      arrayToCsv(['id', 'invoiceNumber', 'planId', 'amount', 'currency', 'status', 'paidAt', 'createdAt'], invoices),
      { name: 'subscription_invoices.csv' }
    );

    await archive.finalize();
  } catch (error) {
    console.error('Error in exportOrganizationData:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to export organization data', details: error.message });
    }
  }
};

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

/**
 * Owner-Initiated Account Closure (7D)
 * POST /api/organizations/close-account
 *
 * Sets deletedAt and scheduledPurgeAt (+30 days), cancels subscription,
 * revokes all active member tokens, logs audit activity.
 */
exports.closeOrganizationAccount = async (req, res) => {
  try {
    const orgId = req.organizationId
      ? parseInt(req.organizationId, 10)
      : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const { currentPassword } = req.body;
    if (!currentPassword) {
      return res.status(401).json({ error: 'Password confirmation is required to close the account.' });
    }

    // Verify caller is an active owner of this organization
    const membershipWhere = {
      organizationId: orgId,
      status: 'active'
    };
    if (req.user.isEmployee) {
      membershipWhere.employeeId = req.user.id;
    } else {
      membershipWhere.userId = req.user.id;
    }

    const callerMembership = await OrganizationMembership.findOne({ where: membershipWhere });
    if (!callerMembership || callerMembership.orgRole !== 'owner') {
      return res.status(403).json({ error: 'Access denied: Only organization owners can close the account.' });
    }

    // Verify caller password
    let isPasswordValid = false;
    if (req.user.isEmployee) {
      const employee = await Employee.findByPk(req.user.id);
      if (employee) {
        isPasswordValid = await employee.validatePassword(currentPassword);
      }
    } else {
      const user = await User.findByPk(req.user.id);
      if (user) {
        isPasswordValid = await user.validatePassword(currentPassword);
      }
    }

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid password. Account closure refused.' });
    }

    const org = await Organization.findByPk(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found.' });
    }

    if (org.deletedAt) {
      return res.status(400).json({ error: 'Organization account is already closed.' });
    }

    const now = new Date();
    const scheduledPurgeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    org.deletedAt = now;
    org.scheduledPurgeAt = scheduledPurgeAt;
    await org.save();

    // Cancel subscription and mark canceled
    try {
      await billingService.cancelSubscription(orgId);
    } catch (subErr) {
      console.warn(`[7D-CLOSE] Note on subscription cancellation for org ${orgId}:`, subErr.message);
    }

    const sub = await Subscription.findOne({ where: { organizationId: orgId } });
    if (sub) {
      sub.status = 'canceled';
      await sub.save();
    }

    // Revoke all tokens for all members of this organization
    const memberships = await OrganizationMembership.findAll({ where: { organizationId: orgId } });
    for (const m of memberships) {
      if (m.userId) {
        await tokenRevocationService.revokeAllUserTokens(m.userId, false);
      }
      if (m.employeeId) {
        await tokenRevocationService.revokeAllUserTokens(m.employeeId, true);
      }
    }

    // Audit log
    const shops = await Shop.findAll({ where: { organizationId: orgId }, attributes: ['id'] });
    if (shops.length && req.user?.id && !req.user.isEmployee) {
      try {
        await ActivityLog.create({
          shopId: shops[0].id,
          userId: req.user.id,
          action: 'ORGANIZATION_ACCOUNT_CLOSED',
          entity: 'Organization',
          entityId: String(orgId),
          details: `Organization "${org.name}" account closed by owner. Data scheduled for purge at ${scheduledPurgeAt.toISOString()}.`
        });
      } catch (logErr) {
        console.error('Failed to log account closure activity:', logErr);
      }
    }

    return res.json({
      message: 'Organization account closed. All data scheduled for purge in 30 days.',
      deletedAt: now,
      scheduledPurgeAt
    });
  } catch (error) {
    console.error('Error in closeOrganizationAccount:', error);
    return res.status(500).json({ error: 'Failed to close organization account', details: error.message });
  }
};

