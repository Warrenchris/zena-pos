'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Users.authzVersion
    const [userCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Users\` LIKE 'authzVersion';
    `);
    if (userCols.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Users\`
        ADD COLUMN \`authzVersion\` INT UNSIGNED NOT NULL DEFAULT 1;
      `);
    }

    // 2. Employees.authzVersion
    const [empCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Employees\` LIKE 'authzVersion';
    `);
    if (empCols.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Employees\`
        ADD COLUMN \`authzVersion\` INT UNSIGNED NOT NULL DEFAULT 1;
      `);
    }
  },

  async down(queryInterface, Sequelize) {
    // 1. Drop from Employees
    const [empCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Employees\` LIKE 'authzVersion';
    `);
    if (empCols.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Employees\`
        DROP COLUMN \`authzVersion\`;
      `);
    }

    // 2. Drop from Users
    const [userCols] = await queryInterface.sequelize.query(`
      SHOW COLUMNS FROM \`Users\` LIKE 'authzVersion';
    `);
    if (userCols.length > 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Users\`
        DROP COLUMN \`authzVersion\`;
      `);
    }
  }
};
