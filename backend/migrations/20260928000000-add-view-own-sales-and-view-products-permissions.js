'use strict';

/**
 * Migration: Add view_own_sales and view_products permissions to Permissions table,
 * and backfill default mappings (cashier & admin) for organizations that already have
 * role permissions seeded.
 *
 * Idempotent, MySQL compatible.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // 1. Insert Permission rows for view_own_sales and view_products if missing
    const permissionsToEnsure = [
      { name: 'view_own_sales', description: 'View Own Sales History' },
      { name: 'view_products', description: 'View Products' }
    ];

    for (const p of permissionsToEnsure) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM `Permissions` WHERE `name` = ?',
        { replacements: [p.name] }
      );
      if (existing.length === 0) {
        await queryInterface.sequelize.query(
          'INSERT INTO `Permissions` (`name`, `description`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?)',
          { replacements: [p.name, p.description, now, now] }
        );
        console.log(`[Migration] Inserted permission '${p.name}'.`);
      }
    }

    const [perms] = await queryInterface.sequelize.query(
      'SELECT id, name FROM `Permissions` WHERE `name` IN ("view_own_sales", "view_products")'
    );
    const permMap = {};
    for (const row of perms) {
      permMap[row.name] = row.id;
    }
    const viewOwnSalesId = permMap['view_own_sales'];
    const viewProductsId = permMap['view_products'];

    // 2. For every organization that already has at least one RolePermissions row,
    // insert rows for the new permissions: cashier -> view_own_sales and view_products;
    // admin -> both (for matrix consistency).
    // Orgs with zero RolePermissions rows are NOT touched (lazy seeder covers them).
    const [seededOrgs] = await queryInterface.sequelize.query(
      'SELECT DISTINCT `organizationId` FROM `RolePermissions` WHERE `organizationId` IS NOT NULL'
    );

    for (const org of seededOrgs) {
      const orgId = org.organizationId;
      const targets = [
        { role: 'cashier', permId: viewOwnSalesId },
        { role: 'cashier', permId: viewProductsId },
        { role: 'admin', permId: viewOwnSalesId },
        { role: 'admin', permId: viewProductsId }
      ];

      for (const t of targets) {
        if (!t.permId) continue;
        const [exists] = await queryInterface.sequelize.query(
          'SELECT id FROM `RolePermissions` WHERE `organizationId` = ? AND `role` = ? AND `permissionId` = ?',
          { replacements: [orgId, t.role, t.permId] }
        );
        if (exists.length === 0) {
          await queryInterface.sequelize.query(
            'INSERT INTO `RolePermissions` (`organizationId`, `role`, `permissionId`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?)',
            { replacements: [orgId, t.role, t.permId, now, now] }
          );
        }
      }
    }
    console.log(`[Migration] Backfilled view_own_sales and view_products for ${seededOrgs.length} seeded organizations.`);
  },

  async down(queryInterface, Sequelize) {
    const [perms] = await queryInterface.sequelize.query(
      'SELECT id, name FROM `Permissions` WHERE `name` IN ("view_own_sales", "view_products")'
    );
    const permIds = perms.map(p => p.id);

    if (permIds.length > 0) {
      // 1. Remove RolePermissions rows referencing these permissions
      await queryInterface.sequelize.query(
        `DELETE FROM \`RolePermissions\` WHERE \`permissionId\` IN (${permIds.map(() => '?').join(',')})`,
        { replacements: permIds }
      );
      console.log('[Migration Rollback] Removed backfilled RolePermissions rows.');

      // 2. Remove Permission rows if nothing else references them
      for (const pid of permIds) {
        const [refs] = await queryInterface.sequelize.query(
          'SELECT id FROM `RolePermissions` WHERE `permissionId` = ?',
          { replacements: [pid] }
        );
        if (refs.length === 0) {
          await queryInterface.sequelize.query(
            'DELETE FROM `Permissions` WHERE `id` = ?',
            { replacements: [pid] }
          );
          console.log(`[Migration Rollback] Deleted Permission ID ${pid}.`);
        }
      }
    }
  }
};
