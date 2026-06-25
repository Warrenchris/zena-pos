'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Sales');

    // 1. Add invoiceNumber
    if (!tableInfo.invoiceNumber) {
      await queryInterface.addColumn('Sales', 'invoiceNumber', {
        type: Sequelize.STRING,
        allowNull: true
      });
      // Try to add index
      try {
        await queryInterface.addIndex('Sales', ['invoiceNumber'], {
          unique: true,
          name: 'Sales_invoiceNumber_unique'
        });
      } catch (err) {}
    }

    // 2. Add subtotal
    if (!tableInfo.subtotal) {
      await queryInterface.addColumn('Sales', 'subtotal', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }

    // 3. Add tax
    if (!tableInfo.tax) {
      await queryInterface.addColumn('Sales', 'tax', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00
      });
    }

    // 4. Add discount
    if (!tableInfo.discount) {
      await queryInterface.addColumn('Sales', 'discount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0.00
      });
    }

    // 5. Add total
    if (!tableInfo.total) {
      await queryInterface.addColumn('Sales', 'total', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      });
    }

    // 6. Add paymentMethod if not present, otherwise change to VARCHAR(50) if it is ENUM
    if (!tableInfo.paymentMethod) {
      await queryInterface.addColumn('Sales', 'paymentMethod', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'cash'
      });
    } else if (tableInfo.paymentMethod.type && tableInfo.paymentMethod.type.includes('ENUM')) {
      await queryInterface.changeColumn('Sales', 'paymentMethod', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'cash'
      });
    }

    // 7. Make legacy totalAmount nullable to prevent insert errors when omitted
    if (tableInfo.totalAmount) {
      await queryInterface.changeColumn('Sales', 'totalAmount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      }).catch(() => {});
    }

    // 8. Make legacy status nullable to prevent insert errors when omitted
    if (tableInfo.status) {
      await queryInterface.changeColumn('Sales', 'status', {
        type: Sequelize.ENUM('pending', 'completed', 'cancelled'),
        allowNull: true
      }).catch(() => {});
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
