'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Products');

    // 1. Add stockQuantity (which replaces quantity from initial schema)
    if (!tableInfo.stockQuantity) {
      await queryInterface.addColumn('Products', 'stockQuantity', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }

    // 2. Add sku
    if (!tableInfo.sku) {
      await queryInterface.addColumn('Products', 'sku', {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: ''
      });
    }

    // 3. Add barcode
    if (!tableInfo.barcode) {
      await queryInterface.addColumn('Products', 'barcode', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    // 4. Add cost
    if (!tableInfo.cost) {
      await queryInterface.addColumn('Products', 'cost', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      });
    }

    // 5. Add reorderPoint
    if (!tableInfo.reorderPoint) {
      await queryInterface.addColumn('Products', 'reorderPoint', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10
      });
    }

    // 6. Add expirationDate
    if (!tableInfo.expirationDate) {
      await queryInterface.addColumn('Products', 'expirationDate', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // 7. Add active
    if (!tableInfo.active) {
      await queryInterface.addColumn('Products', 'active', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }

    // 8. Safely remove legacy 'quantity' column if present
    if (tableInfo.quantity) {
      await queryInterface.removeColumn('Products', 'quantity').catch(() => {});
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
