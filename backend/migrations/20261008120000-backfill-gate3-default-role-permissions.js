'use strict';

/**
 * Migration: Backfill default role permissions introduced since baseline commit 1f45448:
 * - Permissions: manage_coupons, manage_discounts, manage_held_carts
 * - Admin mappings: manage_coupons, manage_discounts, manage_held_carts
 * - Manager mappings: manage_customers, manage_coupons, manage_discounts, manage_held_carts
 *
 * Idempotent, MySQL compatible. Safe to run multiple times.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // 1. Ensure global Permission table rows exist for permissions added since 1f45448
    const permissionsToEnsure = [
      { name: 'manage_coupons', description: 'Manage Coupons & Promo Codes' },
      { name: 'manage_discounts', description: 'Manage Store Discount Rules' },
      { name: 'manage_held_carts', description: 'Branch-wide Held Cart Management' }
    ];

    for (const p of permissionsToEnsure) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM `Permissions` WHERE `name` = ? LIMIT 1',
        { replacements: [p.name] }
      );
      if (existing.length === 0) {
        await queryInterface.sequelize.query(
          'INSERT INTO `Permissions` (`name`, `description`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?)',
          { replacements: [p.name, p.description, now, now] }
        );
      }
    }

    // 2. Fetch permission IDs for all target permissions
    const [perms] = await queryInterface.sequelize.query(
      'SELECT id, name FROM `Permissions` WHERE `name` IN ("manage_customers", "manage_coupons", "manage_discounts", "manage_held_carts")'
    );
    const permMap = {};
    for (const row of perms) {
      permMap[row.name] = row.id;
    }

    // 3. For every organization that has at least one RolePermissions row,
    // backfill missing mappings for newly introduced default permissions:
    // - admin: manage_coupons, manage_discounts, manage_held_carts
    // - manager: manage_customers, manage_coupons, manage_discounts, manage_held_carts
    const [seededOrgs] = await queryInterface.sequelize.query(
      'SELECT DISTINCT rp.`organizationId` FROM `RolePermissions` rp INNER JOIN `Organizations` o ON rp.`organizationId` = o.`id` WHERE rp.`organizationId` IS NOT NULL'
    );

    for (const org of seededOrgs) {
      const orgId = org.organizationId;
      const targets = [
        { role: 'admin', permId: permMap['manage_coupons'] },
        { role: 'admin', permId: permMap['manage_discounts'] },
        { role: 'admin', permId: permMap['manage_held_carts'] },
        { role: 'manager', permId: permMap['manage_customers'] },
        { role: 'manager', permId: permMap['manage_coupons'] },
        { role: 'manager', permId: permMap['manage_discounts'] },
        { role: 'manager', permId: permMap['manage_held_carts'] }
      ];

      for (const t of targets) {
        if (!t.permId) continue;
        const [exists] = await queryInterface.sequelize.query(
          'SELECT id FROM `RolePermissions` WHERE `organizationId` = ? AND `role` = ? AND `permissionId` = ? LIMIT 1',
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
  },

  async down(queryInterface, Sequelize) {
    const [perms] = await queryInterface.sequelize.query(
      'SELECT id, name FROM `Permissions` WHERE `name` IN ("manage_coupons", "manage_discounts", "manage_held_carts")'
    );
    const permIds = perms.map(p => p.id);

    if (permIds.length > 0) {
      await queryInterface.sequelize.query(
        `DELETE FROM \`RolePermissions\` WHERE \`permissionId\` IN (${permIds.map(() => '?').join(',')})`,
        { replacements: permIds }
      );

      for (const pid of permIds) {
        const [refs] = await queryInterface.sequelize.query(
          'SELECT id FROM `RolePermissions` WHERE `permissionId` = ? LIMIT 1',
          { replacements: [pid] }
        );
        if (refs.length === 0) {
          await queryInterface.sequelize.query(
            'DELETE FROM `Permissions` WHERE `id` = ?',
            { replacements: [pid] }
          );
        }
      }
    }
  }
};
