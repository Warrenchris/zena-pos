'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Assert zero unlinked shops exist before enforcing NOT NULL
    const [orphans] = await queryInterface.sequelize.query(
      'SELECT id, name FROM `Shops` WHERE organizationId IS NULL'
    );
    if (orphans.length > 0) {
      throw new Error(
        `Cannot enforce NOT NULL on Shops.organizationId: found ${orphans.length} orphan shops: ${JSON.stringify(orphans)}`
      );
    }

    // 2. Alter column to NOT NULL
    await queryInterface.changeColumn('Shops', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    // 3. Add index if not already present
    const [indexes] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM `Shops` WHERE Key_name = 'idx_shops_organization_id'"
    );
    if (indexes.length === 0) {
      await queryInterface.addIndex('Shops', ['organizationId'], {
        name: 'idx_shops_organization_id'
      });
    }

    // 4. Add foreign key constraint with ON DELETE RESTRICT
    const [constraints] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Shops' AND CONSTRAINT_NAME = 'fk_shops_organization_id'`
    );
    if (constraints.length === 0) {
      await queryInterface.sequelize.query(
        `ALTER TABLE \`Shops\` ADD CONSTRAINT \`fk_shops_organization_id\` 
         FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) 
         ON DELETE RESTRICT ON UPDATE CASCADE`
      );
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Drop foreign key constraint if exists
    const [constraints] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Shops' AND CONSTRAINT_NAME = 'fk_shops_organization_id'`
    );
    if (constraints.length > 0) {
      await queryInterface.sequelize.query(
        'ALTER TABLE `Shops` DROP FOREIGN KEY `fk_shops_organization_id`'
      );
    }

    // 2. Drop index if exists
    const [indexes] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM `Shops` WHERE Key_name = 'idx_shops_organization_id'"
    );
    if (indexes.length > 0) {
      await queryInterface.removeIndex('Shops', 'idx_shops_organization_id');
    }

    // 3. Revert column to nullable
    await queryInterface.changeColumn('Shops', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  }
};
