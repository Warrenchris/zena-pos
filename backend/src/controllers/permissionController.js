const { Permission, RolePermission, User, OrganizationMembership } = require('../models');
const sequelize = require('../config/database');
const permissionCache = require('../services/permissionCache');

const DEFAULT_PERMISSIONS = [
  { name: 'manage_settings', description: 'Manage System & Shop Settings' },
  { name: 'manage_users', description: 'Manage Users & Role Permissions' },
  { name: 'manage_products', description: 'Manage Products & Inventory Catalog' },
  { name: 'manage_categories', description: 'Manage Product Categories' },
  { name: 'view_reports', description: 'View Financial & Sales Reports' },
  { name: 'access_pos', description: 'Access POS Checkout Screen' },
  { name: 'create_sales', description: 'Create & Process Sales Orders' },
  { name: 'manage_sales', description: 'Manage Sales History & Invoices' },
  { name: 'process_refunds', description: 'Process Refunds & Returns' },
  { name: 'manage_expenses', description: 'Manage Business Expenses' },
  { name: 'view_customers', description: 'View Customer Information' },
  { name: 'manage_customers', description: 'Create & Edit Customers' },
  { name: 'manage_employees', description: 'Manage Employee Profiles' },
  { name: 'view_dashboard', description: 'View Business Dashboard Metrics' }
];

const ROLES = ['admin', 'manager', 'cashier'];
const ENFORCED_PERMISSIONS = ['create_sales', 'manage_settings', 'view_own_sales', 'process_refunds'];

async function getRequesterOrgRole(req, transaction = null) {
  if (req.user?.orgRole) return req.user.orgRole;
  const orgId = req.organizationId || req.user?.organizationId;
  const where = {
    ...(orgId ? { organizationId: orgId } : {}),
    ...(req.user?.isEmployee ? { employeeId: req.user.id } : { userId: req.user?.id })
  };
  const membership = await OrganizationMembership.findOne({
    where,
    ...(transaction ? { transaction } : {})
  });
  const orgRole = membership?.orgRole || null;
  if (req.user) req.user.orgRole = orgRole;
  return orgRole;
}

// Seed default permissions if database table is empty for THIS organizationId
async function ensurePermissionsSeeded(organizationId) {
  let permissions = await Permission.findAll({ order: [['id', 'ASC']] });
  if (permissions.length === 0) {
    permissions = await Permission.bulkCreate(DEFAULT_PERMISSIONS);
  }

  if (organizationId) {
    const existingCount = await RolePermission.count({
      where: { organizationId }
    });

    if (existingCount === 0) {
      // Seed default role-permission mappings for this organization
      const adminPerms = permissions.map(p => ({
        organizationId,
        role: 'admin',
        permissionId: p.id
      }));
      const managerPermNames = [
        'view_dashboard', 'manage_products', 'manage_categories', 'manage_employees',
        'view_reports', 'manage_sales', 'manage_expenses', 'view_customers',
        'manage_settings', 'process_refunds'
      ];
      const cashierPermNames = ['access_pos', 'create_sales', 'view_products'];

      const managerPerms = permissions
        .filter(p => managerPermNames.includes(p.name))
        .map(p => ({ organizationId, role: 'manager', permissionId: p.id }));
        
      const cashierPerms = permissions
        .filter(p => cashierPermNames.includes(p.name))
        .map(p => ({ organizationId, role: 'cashier', permissionId: p.id }));

      await RolePermission.bulkCreate([...adminPerms, ...managerPerms, ...cashierPerms], { ignoreDuplicates: true });
    }
  }

  return permissions;
}

// GET /api/permissions/matrix
exports.getPermissionMatrix = async (req, res) => {
  try {
    const organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context is required' });
    }

    const permissions = await ensurePermissionsSeeded(organizationId);
    const rolePermissions = await RolePermission.findAll({
      where: { organizationId }
    });

    // Construct boolean lookup matrix: { admin: { manage_settings: true }, cashier: { ... } }
    const matrix = {};
    ROLES.forEach(role => {
      matrix[role] = {};
      permissions.forEach(p => {
        // Admin gets true by default unless explicitly disabled, but we check DB
        matrix[role][p.name] = false;
      });
    });

    const permMap = {};
    permissions.forEach(p => {
      permMap[p.id] = p.name;
    });

    rolePermissions.forEach(rp => {
      const permName = permMap[rp.permissionId];
      if (permName && matrix[rp.role]) {
        matrix[rp.role][permName] = true;
      }
    });

    // Ensure admin role matrix defaults to true for all permissions if no explicit rows
    permissions.forEach(p => {
      if (matrix['admin'][p.name] === undefined || !rolePermissions.some(rp => rp.role === 'admin')) {
        matrix['admin'][p.name] = true;
      }
    });

    res.json({
      success: true,
      roles: ROLES,
      permissions: permissions.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        enforced: ENFORCED_PERMISSIONS.includes(p.name)
      })),
      matrix
    });
  } catch (error) {
    console.error('Error fetching permission matrix:', error);
    res.status(500).json({ error: 'Failed to fetch permission matrix', details: error.message });
  }
};

// PUT /api/permissions/matrix
exports.updatePermissionMatrix = async (req, res) => {
  const requesterOrgRole = await getRequesterOrgRole(req);
  if (requesterOrgRole !== 'owner') {
    return res.status(403).json({ error: 'Permission denied', details: 'Only the organization owner can modify role permissions' });
  }

  const organizationId = req.organizationId || req.user?.organizationId;
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context is required' });
  }

  const transaction = await sequelize.transaction();
  try {
    const { updates } = req.body; // Array of { role, permissionId, permissionName, enabled }

    if (!updates || !Array.isArray(updates)) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Invalid payload: updates must be an array' });
    }

    const allPermissions = await Permission.findAll();
    const permIdMap = {};
    const permNameMap = {};
    allPermissions.forEach(p => {
      permIdMap[p.name] = p.id;
      permNameMap[p.id] = p.name;
    });

    // Self-lockout check: Prevent stripping manage_settings or manage_users from admin
    const criticalPerms = ['manage_settings', 'manage_users'];
    for (const update of updates) {
      const permName = update.permissionName || permNameMap[update.permissionId];
      if (update.role === 'admin' && criticalPerms.includes(permName) && update.enabled === false) {
        await transaction.rollback();
        return res.status(400).json({
          error: `Cannot remove critical permission '${permName}' from admin role to prevent system lockout.`
        });
      }
    }

    // Process updates scoped by organizationId
    for (const update of updates) {
      const role = update.role;
      let permissionId = update.permissionId;
      if (!permissionId && update.permissionName) {
        permissionId = permIdMap[update.permissionName];
      }

      if (!ROLES.includes(role) || !permissionId) {
        continue;
      }

      if (update.enabled) {
        await RolePermission.findOrCreate({
          where: { organizationId, role, permissionId },
          defaults: { organizationId, role, permissionId },
          transaction
        });
      } else {
        await RolePermission.destroy({
          where: { organizationId, role, permissionId },
          transaction
        });
      }
    }

    await transaction.commit();

    // Invalidate Redis/memory permission cache
    for (const role of ROLES) {
      await permissionCache.invalidateRoleCache(role, organizationId);
    }
    if (permissionCache.invalidateAllPermissionCache) {
      await permissionCache.invalidateAllPermissionCache();
    } else if (permissionCache.clearAllCaches) {
      await permissionCache.clearAllCaches();
    }

    // Return fresh matrix
    return exports.getPermissionMatrix(req, res);
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating permission matrix:', error);
    res.status(500).json({ error: 'Failed to update permission matrix', details: error.message });
  }
};
