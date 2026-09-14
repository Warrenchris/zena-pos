'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'SubscriptionInvoices'");
    if (tables.length > 0) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`SubscriptionInvoices\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`invoiceNumber\` VARCHAR(100) NOT NULL,
        \`organizationId\` INT NOT NULL,
        \`subscriptionId\` CHAR(36) COLLATE utf8mb4_bin NOT NULL,
        \`planId\` INT NOT NULL,
        \`amount\` DECIMAL(10, 2) NOT NULL,
        \`currency\` VARCHAR(3) NOT NULL DEFAULT 'KES',
        \`billingPeriodStart\` DATETIME NULL,
        \`billingPeriodEnd\` DATETIME NULL,
        \`paymentChannel\` ENUM('mpesa', 'card', 'bank_transfer', 'manual') NOT NULL,
        \`paymentReference\` VARCHAR(200) NULL,
        \`gatewayReference\` VARCHAR(200) NULL,
        \`status\` ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
        \`paidAt\` DATETIME NULL,
        \`metadata\` JSON NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_subscription_invoices_invoice_number\` (\`invoiceNumber\`),
        KEY \`idx_sub_invoices_org_id\` (\`organizationId\`),
        KEY \`idx_sub_invoices_sub_id\` (\`subscriptionId\`),
        KEY \`idx_sub_invoices_reference\` (\`paymentReference\`),
        CONSTRAINT \`fk_sub_invoices_org\` FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_sub_invoices_sub\` FOREIGN KEY (\`subscriptionId\`) REFERENCES \`Subscriptions\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_sub_invoices_plan\` FOREIGN KEY (\`planId\`) REFERENCES \`Plans\` (\`id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('SubscriptionInvoices');
  }
};
