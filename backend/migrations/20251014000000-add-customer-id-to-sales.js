'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('Sales');
    if (!tableInfo.customerId) {
      await queryInterface.addColumn('Sales', 'customerId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('Sales');
    if (tableInfo.customerId) {
      await queryInterface.removeColumn('Sales', 'customerId');
    }
  }
};