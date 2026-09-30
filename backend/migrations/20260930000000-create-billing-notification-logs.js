'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'BillingNotificationLogs'");
    if (tables.length > 0) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`BillingNotificationLogs\` (
        \`id\` CHAR(36) COLLATE utf8mb4_bin NOT NULL,
        \`organizationId\` INT NOT NULL,
        \`subscriptionId\` CHAR(36) COLLATE utf8mb4_bin NULL,
        \`invoiceId\` INT NULL,
        \`eventType\` VARCHAR(60) NOT NULL,
        \`periodKey\` VARCHAR(100) NOT NULL,
        \`recipientEmail\` VARCHAR(255) NOT NULL,
        \`recipientName\` VARCHAR(255) NULL,
        \`status\` ENUM('sent', 'failed', 'skipped') NOT NULL DEFAULT 'sent',
        \`error\` TEXT NULL,
        \`metadata\` JSON NULL,
        \`sentAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_billing_notif_org_event_period\` (\`organizationId\`, \`eventType\`, \`periodKey\`),
        KEY \`idx_billing_notif_org_id\` (\`organizationId\`),
        KEY \`idx_billing_notif_sub_id\` (\`subscriptionId\`),
        KEY \`idx_billing_notif_invoice_id\` (\`invoiceId\`),
        CONSTRAINT \`fk_billing_notif_org\` FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_billing_notif_sub\` FOREIGN KEY (\`subscriptionId\`) REFERENCES \`Subscriptions\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`fk_billing_notif_invoice\` FOREIGN KEY (\`invoiceId\`) REFERENCES \`SubscriptionInvoices\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('BillingNotificationLogs');
  }
};
