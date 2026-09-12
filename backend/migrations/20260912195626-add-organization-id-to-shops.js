'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [cols] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `Shops` LIKE 'organizationId'"
    );
    if (cols.length === 0) {
      await queryInterface.addColumn('Shops', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
  },

  async down(queryInterface) {
    const [cols] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `Shops` LIKE 'organizationId'"
    );
    if (cols.length > 0) {
      await queryInterface.removeColumn('Shops', 'organizationId');
    }
  }
};
