'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Single set-based INSERT...SELECT to grandfather every existing organization with zero duplicates and zero skipped
    await queryInterface.sequelize.query(`
      INSERT INTO \`Subscriptions\` (
        \`id\`,
        \`organizationId\`,
        \`planId\`,
        \`status\`,
        \`billingCycle\`,
        \`currentPeriodStart\`,
        \`currentPeriodEnd\`,
        \`trialEndsAt\`,
        \`cancelAtPeriodEnd\`,
        \`createdAt\`,
        \`updatedAt\`
      )
      SELECT
        UUID(),
        o.id,
        (SELECT id FROM \`Plans\` WHERE \`code\` = 'grandfathered' LIMIT 1),
        'active',
        'yearly',
        NOW(),
        '2099-12-31 23:59:59',
        NULL,
        0,
        NOW(),
        NOW()
      FROM \`Organizations\` o
      WHERE NOT EXISTS (
        SELECT 1 FROM \`Subscriptions\` s WHERE s.organizationId = o.id
      );
    `);
  },

  async down(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'Subscriptions'");
    if (tables.length > 0) {
      await queryInterface.sequelize.query(`
        DELETE s FROM \`Subscriptions\` s
        INNER JOIN \`Plans\` p ON s.planId = p.id
        WHERE p.code = 'grandfathered';
      `);
    }
  }
};
