'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('Customers');
    if (!tableInfo.location) {
      await queryInterface.addColumn('Customers', 'location', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Customers', 'location');
  }
};
