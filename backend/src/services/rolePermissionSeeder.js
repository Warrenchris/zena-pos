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
  { name: 'view_dashboard', description: 'View Business Dashboard Metrics' },
  { name: 'view_own_sales', description: 'View Own Sales History' },
  { name: 'view_products', description: 'View Products' },
  { name: 'manage_coupons', description: 'Manage Coupons & Promo Codes' },
  { name: 'manage_discounts', description: 'Manage Store Discount Rules' },
  { name: 'manage_held_carts', description: 'Branch-wide Held Cart Management' }
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
  'process_refunds',
  'manage_coupons',
  'manage_discounts',
  'manage_held_carts'
];

const cashierPermNames = ['access_pos', 'create_sales', 'view_products', 'view_own_sales'];

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
    const existingRolePerms = await RolePermission.findAll({
      where: { organizationId }
    });
    const existingPairs = new Set(existingRolePerms.map(rp => `${rp.role}:${rp.permissionId}`));

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

    const allDesired = [...adminPerms, ...managerPerms, ...cashierPerms];
    const missingRolePerms = allDesired.filter(dp => !existingPairs.has(`${dp.role}:${dp.permissionId}`));

    if (missingRolePerms.length > 0) {
      await RolePermission.bulkCreate(missingRolePerms, {
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
