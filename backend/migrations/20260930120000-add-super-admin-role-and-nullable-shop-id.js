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

    // 2. Rollback safe-guard: delete super_admin and NULL shopId rows before re-enforcing NOT NULL
    // Documented per ADD 1 as accepted one-way risk during rollback
    await queryInterface.sequelize.query(`
      DELETE FROM \`Users\`
      WHERE \`role\` = 'super_admin' OR \`shopId\` IS NULL;
    `);

    // 3. Restore shopId NOT NULL
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Users\`
      MODIFY COLUMN \`shopId\` INT NOT NULL;
    `);

    // 4. Fallback any non-standard roles to admin
    await queryInterface.sequelize.query(`
      UPDATE \`Users\`
      SET \`role\` = 'admin'
      WHERE \`role\` NOT IN ('admin', 'manager', 'cashier');
    `);

    // 5. Revert role enum
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Users\`
      MODIFY COLUMN \`role\` ENUM('admin', 'manager', 'cashier') NOT NULL DEFAULT 'cashier';
    `);
  }
};
