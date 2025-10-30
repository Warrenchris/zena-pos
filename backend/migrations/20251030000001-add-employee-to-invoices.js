'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column exists
    const tableInfo = await queryInterface.describeTable('invoices');
    if (!tableInfo.employeeId) {
      await queryInterface.addColumn('invoices', 'employeeId', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });

      // Add index for better query performance
      await queryInterface.addIndex('invoices', ['employeeId']);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('invoices', ['employeeId']);
    await queryInterface.removeColumn('invoices', 'employeeId');
  }
};