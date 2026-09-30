'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Categories.taxCategory
    const [catCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Categories\` LIKE 'taxCategory';
    `);
    if (catCols.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Categories\`
        ADD COLUMN \`taxCategory\` ENUM('standard', 'zero_rated', 'exempt') NULL DEFAULT NULL;
      `);
    }

    // 2. Products.taxCategory
    const [prodCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Products\` LIKE 'taxCategory';
    `);
    if (prodCols.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Products\`
        ADD COLUMN \`taxCategory\` ENUM('standard', 'zero_rated', 'exempt') NULL DEFAULT NULL;
      `);
    }

    // 3. SystemSettings.taxInclusive
    const [sysCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`SystemSettings\` LIKE 'taxInclusive';
    `);
    if (sysCols.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`SystemSettings\`
        ADD COLUMN \`taxInclusive\` TINYINT(1) NOT NULL DEFAULT 0;
      `);
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Drop SystemSettings.taxInclusive
    const [sysCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`SystemSettings\` LIKE 'taxInclusive';
    `);
    if (sysCols.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`SystemSettings\`
        DROP COLUMN \`taxInclusive\`;
      `);
    }

    // 2. Drop Products.taxCategory
    const [prodCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Products\` LIKE 'taxCategory';
    `);
    if (prodCols.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Products\`
        DROP COLUMN \`taxCategory\`;
      `);
    }

    // 3. Drop Categories.taxCategory
    const [catCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Categories\` LIKE 'taxCategory';
    `);
    if (catCols.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Categories\`
        DROP COLUMN \`taxCategory\`;
      `);
    }
  }
};
