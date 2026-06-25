'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Expenses');

    // 1. Add paymentMethod if not present
    if (!tableInfo.paymentMethod) {
      await queryInterface.addColumn('Expenses', 'paymentMethod', {
        type: Sequelize.ENUM('cash', 'card', 'bank_transfer', 'mobile_money', 'other'),
        allowNull: false,
        defaultValue: 'cash'
      });
    }

    // 2. Add reference if not present
    if (!tableInfo.reference) {
      await queryInterface.addColumn('Expenses', 'reference', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    // 3. Add notes if not present
    if (!tableInfo.notes) {
      await queryInterface.addColumn('Expenses', 'notes', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    // 4. Add userId if not present
    if (!tableInfo.userId) {
      await queryInterface.addColumn('Expenses', 'userId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        }
      });
    }

    // 5. Change category column type from VARCHAR to ENUM if needed
    if (tableInfo.category && !tableInfo.category.type.includes('ENUM')) {
      await queryInterface.changeColumn('Expenses', 'category', {
        type: Sequelize.ENUM('inventory', 'salary', 'rent', 'utilities', 'maintenance', 'marketing', 'other'),
        allowNull: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
