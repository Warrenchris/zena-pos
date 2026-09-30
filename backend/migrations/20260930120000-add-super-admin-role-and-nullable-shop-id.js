'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Expand Users.role enum to include 'super_admin'
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Users\`
      MODIFY COLUMN \`role\` ENUM('admin', 'manager', 'cashier', 'super_admin') NOT NULL DEFAULT 'cashier';
    `);

    // 2. Allow Users.shopId to be nullable (super_admin has no shop context)
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Users\`
      MODIFY COLUMN \`shopId\` INT NULL;
    `);

    // 3. Pre-flight check and add idx_organizations_created_at if not present
    const [existingIndexes] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM \`Organizations\` WHERE Key_name = 'idx_organizations_created_at';
    `);

    if (existingIndexes.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Organizations\`
        ADD INDEX \`idx_organizations_created_at\` (\`createdAt\`);
      `);
    }
  },

  async down(queryInterface, Sequelize) {
    /**
     * SAFETY NOTICE: DESTRUCTIVE ROLLBACK
     * -----------------------------------
     * Rolling back this migration is inherently destructive:
     * 1. It PERMANENTLY DELETES all users with role='super_admin' or shopId IS NULL
     *    from the Users table before re-imposing the NOT NULL constraint on shopId.
     * 2. This action cannot be undone. Any platform operator accounts will be lost.
     *
     * To prevent accidental execution in production, this down-migration requires
     * the environment variable ALLOW_DESTRUCTIVE_ROLLBACK=true to be explicitly set.
     * If this variable is absent or not 'true', rollback will abort immediately.
     */
    if (process.env.ALLOW_DESTRUCTIVE_ROLLBACK !== 'true') {
      throw new Error(
        'Refusing to run down-migration on 20260930120000-add-super-admin-role-and-nullable-shop-id: ' +
        'This migration permanently deletes all super-admin users (role=\'super_admin\' or shopId IS NULL) ' +
        'before restoring the NOT NULL constraint on Users.shopId. ' +
        'To proceed, set environment variable ALLOW_DESTRUCTIVE_ROLLBACK=true.'
      );
    }

    // 1. Drop index on Organizations if exists
    const [existingIndexes] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM \`Organizations\` WHERE Key_name = 'idx_organizations_created_at';
    `);
    if (existingIndexes.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Organizations\`
        DROP INDEX \`idx_organizations_created_at\`;
      `);
    }

    // 2. Disassociate any ActivityLogs rows referencing super-admins to prevent FK constraint failures
    await queryInterface.sequelize.query(`
      UPDATE \`ActivityLogs\`
      SET \`userId\` = NULL
      WHERE \`userId\` IN (
        SELECT \`id\` FROM (
          SELECT \`id\` FROM \`Users\` WHERE \`role\` = 'super_admin' OR \`shopId\` IS NULL
        ) AS \`sa_users\`
      );
    `);

    // 3. Rollback safe-guard: delete super_admin and NULL shopId rows before re-enforcing NOT NULL
    // Documented per ADD 1 as accepted one-way risk during rollback
    const [deleteResult] = await queryInterface.sequelize.query(`
      DELETE FROM \`Users\`
      WHERE \`role\` = 'super_admin' OR \`shopId\` IS NULL;
    `);

    const deletedCount = deleteResult?.affectedRows ?? 0;
    console.log(`[rollback] Removed ${deletedCount} super_admin / null-shopId user row(s).`);

    // 4. Restore shopId NOT NULL
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Users\`
      MODIFY COLUMN \`shopId\` INT NOT NULL;
    `);

    // 5. Fallback any non-standard roles to admin
    await queryInterface.sequelize.query(`
      UPDATE \`Users\`
      SET \`role\` = 'admin'
      WHERE \`role\` NOT IN ('admin', 'manager', 'cashier');
    `);

    // 6. Revert role enum
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Users\`
      MODIFY COLUMN \`role\` ENUM('admin', 'manager', 'cashier') NOT NULL DEFAULT 'cashier';
    `);
  }
};
