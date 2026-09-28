'use strict';

const { Permission, RolePermission } = require('../models');

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

const managerPermNames = [
  'view_dashboard',
  'manage_products',
  'manage_categories',
  'manage_employees',
  'view_reports',
  'manage_sales',
  'manage_expenses',
  'view_customers',
  'manage_settings',
  'process_refunds'
];

const cashierPermNames = ['access_pos', 'create_sales', 'view_products'];

/**
 * Ensure default permissions exist globally and default role-permission mappings
 * exist for the specified organizationId.
 *
 * @param {number} organizationId
 * @returns {Promise<Array>} List of all Permission models
 */
async function ensureOrgRolePermissionsSeeded(organizationId) {
  let permissions = await Permission.findAll({ order: [['id', 'ASC']] });
  if (permissions.length === 0) {
    permissions = await Permission.bulkCreate(DEFAULT_PERMISSIONS);
  } else {
    // Ensure all default permissions are represented in the global Permission table
    const existingNames = new Set(permissions.map(p => p.name));
    const missing = DEFAULT_PERMISSIONS.filter(p => !existingNames.has(p.name));
    if (missing.length > 0) {
      await Permission.bulkCreate(missing);
      permissions = await Permission.findAll({ order: [['id', 'ASC']] });
    }
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

      const managerPerms = permissions
        .filter(p => managerPermNames.includes(p.name))
        .map(p => ({ organizationId, role: 'manager', permissionId: p.id }));

      const cashierPerms = permissions
        .filter(p => cashierPermNames.includes(p.name))
        .map(p => ({ organizationId, role: 'cashier', permissionId: p.id }));

      await RolePermission.bulkCreate([...adminPerms, ...managerPerms, ...cashierPerms], {
        ignoreDuplicates: true
      });
    }
  }

  return permissions;
}

module.exports = {
  ensureOrgRolePermissionsSeeded,
  DEFAULT_PERMISSIONS,
  managerPermNames,
  cashierPermNames
};
