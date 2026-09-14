'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Organizations\`
      MODIFY COLUMN \`status\` ENUM('trialing', 'trial', 'active', 'past_due', 'canceled', 'suspended') NOT NULL DEFAULT 'active';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Map any new enum states back to legacy valid enum states before shrinking enum definition
    await queryInterface.sequelize.query(`
      UPDATE \`Organizations\`
      SET \`status\` = 'active'
      WHERE \`status\` NOT IN ('active', 'suspended', 'trial');
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE \`Organizations\`
      MODIFY COLUMN \`status\` ENUM('active', 'suspended', 'trial') NOT NULL DEFAULT 'active';
    `);
  }
};
