'use strict';

/**
 * Migration: Add organizationId and unique constraint to RolePermissions.
 *
 * Scopes role-permission mappings by organizationId to provide true tenant-level
 * authorization control while ensuring cascade cleanup on organization deletion.
 */

async function getColumns(queryInterface, tableName) {
  try {
    const tableDesc = await queryInterface.describeTable(tableName);
    return Object.keys(tableDesc);
  } catch (err) {
    return [];
  }
}

async function getExistingIndexNames(queryInterface, tableName) {
  try {
    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    return new Set(indexes.map(idx => idx.Key_name));
  } catch (err) {
    return new Set();
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Delete all existing global rows in RolePermissions (safe reset per requirement)
    await queryInterface.sequelize.query('DELETE FROM `RolePermissions`');
    console.log('[Migration] Cleared existing un-scoped RolePermissions rows.');

    // 2. Add organizationId column if missing
    const columns = await getColumns(queryInterface, 'RolePermissions');
    if (!columns.includes('organizationId')) {
      await queryInterface.addColumn('RolePermissions', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });
      console.log('[Migration] Added organizationId column to RolePermissions.');
    }

    // 3. Add composite unique index on (organizationId, role, permissionId)
    const indexes = await getExistingIndexNames(queryInterface, 'RolePermissions');
    if (!indexes.has('idx_role_permissions_org_role_perm')) {
      await queryInterface.addIndex('RolePermissions', ['organizationId', 'role', 'permissionId'], {
        unique: true,
        name: 'idx_role_permissions_org_role_perm'
      });
      console.log('[Migration] Added unique index idx_role_permissions_org_role_perm to RolePermissions.');
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Drop foreign key constraint on organizationId first (required before dropping index/column in MySQL)
    try {
      const [fkRows] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'RolePermissions'
          AND COLUMN_NAME = 'organizationId'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `);
      for (const row of fkRows) {
        await queryInterface.sequelize.query(`ALTER TABLE \`RolePermissions\` DROP FOREIGN KEY \`${row.CONSTRAINT_NAME}\``);
        console.log(`[Migration Rollback] Dropped foreign key ${row.CONSTRAINT_NAME}.`);
      }
    } catch (err) {
      console.warn('[Migration Rollback] Warning dropping foreign keys:', err.message);
    }

    // 2. Drop composite unique index if present
    const indexes = await getExistingIndexNames(queryInterface, 'RolePermissions');
    if (indexes.has('idx_role_permissions_org_role_perm')) {
      await queryInterface.removeIndex('RolePermissions', 'idx_role_permissions_org_role_perm');
      console.log('[Migration Rollback] Removed unique index idx_role_permissions_org_role_perm.');
    }

    // 3. Remove column organizationId if present
    const columns = await getColumns(queryInterface, 'RolePermissions');
    if (columns.includes('organizationId')) {
      await queryInterface.removeColumn('RolePermissions', 'organizationId');
      console.log('[Migration Rollback] Removed organizationId column from RolePermissions.');
    }
  }
};
