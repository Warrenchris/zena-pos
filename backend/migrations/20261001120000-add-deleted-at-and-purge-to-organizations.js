'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Organizations.deletedAt
    const [delCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Organizations\` LIKE 'deletedAt';
    `);
    if (delCols.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Organizations\`
        ADD COLUMN \`deletedAt\` DATETIME NULL DEFAULT NULL;
      `);
    }

    // 2. Organizations.scheduledPurgeAt
    const [purgeCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Organizations\` LIKE 'scheduledPurgeAt';
    `);
    if (purgeCols.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Organizations\`
        ADD COLUMN \`scheduledPurgeAt\` DATETIME NULL DEFAULT NULL;
      `);
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Drop scheduledPurgeAt
    const [purgeCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Organizations\` LIKE 'scheduledPurgeAt';
    `);
    if (purgeCols.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Organizations\`
        DROP COLUMN \`scheduledPurgeAt\`;
      `);
    }

    // 2. Drop deletedAt
    const [delCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Organizations\` LIKE 'deletedAt';
    `);
    if (delCols.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Organizations\`
        DROP COLUMN \`deletedAt\`;
      `);
    }
  }
};
