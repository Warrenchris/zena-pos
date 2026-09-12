'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query(
      "SHOW TABLES LIKE 'ShopAccess'"
    );
    if (tables.length > 0) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`ShopAccess\` (
        \`id\` CHAR(36) COLLATE utf8mb4_bin NOT NULL,
        \`membershipId\` CHAR(36) COLLATE utf8mb4_bin NOT NULL,
        \`shopId\` INT NOT NULL,
        \`isDefault\` TINYINT(1) NOT NULL DEFAULT 0,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_shop_access_membership\` FOREIGN KEY (\`membershipId\`) REFERENCES \`OrganizationMemberships\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_shop_access_shop\` FOREIGN KEY (\`shopId\`) REFERENCES \`Shops\` (\`id\`) ON DELETE CASCADE,
        UNIQUE KEY \`uq_membership_shop\` (\`membershipId\`, \`shopId\`),
        KEY \`idx_shop_access_shop\` (\`shopId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ShopAccess');
  }
};
