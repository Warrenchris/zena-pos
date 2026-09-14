'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'Plans'");
    if (tables.length === 0) {
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS \`Plans\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(50) NOT NULL,
          \`code\` VARCHAR(50) NOT NULL,
          \`priceMonthly\` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
          \`currency\` VARCHAR(3) NOT NULL DEFAULT 'KES',
          \`maxShops\` INT NOT NULL DEFAULT 1,
          \`maxUsers\` INT NOT NULL DEFAULT 2,
          \`features\` JSON NOT NULL,
          \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_plans_code\` (\`code\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
    }

    // Seed baseline commercial plans and internal grandfathered tier
    const plansToSeed = [
      {
        name: 'Starter',
        code: 'starter',
        priceMonthly: 1500.00,
        currency: 'KES',
        maxShops: 1,
        maxUsers: 2,
        features: JSON.stringify({ org_insights: false, multi_shop: false, api_access: false }),
        isActive: 1
      },
      {
        name: 'Growth',
        code: 'growth',
        priceMonthly: 3500.00,
        currency: 'KES',
        maxShops: 3,
        maxUsers: 10,
        features: JSON.stringify({ org_insights: true, multi_shop: true, api_access: false }),
        isActive: 1
      },
      {
        name: 'Pro',
        code: 'pro',
        priceMonthly: 7500.00,
        currency: 'KES',
        maxShops: -1,
        maxUsers: -1,
        features: JSON.stringify({ org_insights: true, multi_shop: true, api_access: true }),
        isActive: 1
      },
      {
        name: 'Grandfathered (Founding Merchant)',
        code: 'grandfathered',
        priceMonthly: 0.00,
        currency: 'KES',
        maxShops: -1,
        maxUsers: -1,
        features: JSON.stringify({ org_insights: true, multi_shop: true, api_access: true }),
        isActive: 0
      }
    ];

    for (const plan of plansToSeed) {
      await queryInterface.sequelize.query(`
        INSERT INTO \`Plans\` (\`name\`, \`code\`, \`priceMonthly\`, \`currency\`, \`maxShops\`, \`maxUsers\`, \`features\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
        VALUES (:name, :code, :priceMonthly, :currency, :maxShops, :maxUsers, :features, :isActive, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          \`name\` = VALUES(\`name\`),
          \`priceMonthly\` = VALUES(\`priceMonthly\`),
          \`currency\` = VALUES(\`currency\`),
          \`maxShops\` = VALUES(\`maxShops\`),
          \`maxUsers\` = VALUES(\`maxUsers\`),
          \`features\` = VALUES(\`features\`),
          \`isActive\` = VALUES(\`isActive\`),
          \`updatedAt\` = NOW();
      `, {
        replacements: plan
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Plans');
  }
};
