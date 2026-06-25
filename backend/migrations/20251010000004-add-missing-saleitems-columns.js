'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('SaleItems');

    // 1. Add unitPrice if not present
    if (!tableInfo.unitPrice) {
      await queryInterface.addColumn('SaleItems', 'unitPrice', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }

    // 2. Add subtotal if not present
    if (!tableInfo.subtotal) {
      await queryInterface.addColumn('SaleItems', 'subtotal', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }

    // 3. Make price column nullable to support optional price in models/inserts
    if (tableInfo.price) {
      await queryInterface.changeColumn('SaleItems', 'price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
