'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'Subscriptions'");
    if (tables.length > 0) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`Subscriptions\` (
        \`id\` CHAR(36) COLLATE utf8mb4_bin NOT NULL,
        \`organizationId\` INT NOT NULL,
        \`planId\` INT NOT NULL,
        \`status\` ENUM('trialing', 'active', 'past_due', 'canceled', 'suspended') NOT NULL DEFAULT 'trialing',
        \`billingCycle\` ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
        \`currentPeriodStart\` DATETIME NOT NULL,
        \`currentPeriodEnd\` DATETIME NOT NULL,
        \`trialEndsAt\` DATETIME NULL,
        \`cancelAtPeriodEnd\` TINYINT(1) NOT NULL DEFAULT 0,
        \`lastPaymentMethod\` VARCHAR(50) NULL,
        \`lastPaymentDate\` DATETIME NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_subscriptions_organization_id\` (\`organizationId\`),
        KEY \`idx_subscriptions_org_status\` (\`organizationId\`, \`status\`),
        KEY \`idx_subscriptions_plan_id\` (\`planId\`),
        CONSTRAINT \`fk_subscriptions_organization\` FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_subscriptions_plan\` FOREIGN KEY (\`planId\`) REFERENCES \`Plans\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Subscriptions');
  }
};
