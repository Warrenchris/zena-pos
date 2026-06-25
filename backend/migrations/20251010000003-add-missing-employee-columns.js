'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Employees');

    // 1. Add hireDate if not present
    if (!tableInfo.hireDate) {
      await queryInterface.addColumn('Employees', 'hireDate', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      });
    }

    // 2. Change position column from ENUM to VARCHAR(255) to support model definitions
    if (tableInfo.position && tableInfo.position.type.includes('ENUM')) {
      await queryInterface.changeColumn('Employees', 'position', {
        type: Sequelize.STRING(255),
        allowNull: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
