'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('SalePayments');
    
    // Add gatewayRef if missing
    if (!tableInfo.gatewayRef) {
      await queryInterface.addColumn('SalePayments', 'gatewayRef', {
        type: Sequelize.STRING(200),
        allowNull: true
      });
    }

    // Add paidAt if missing
    if (!tableInfo.paidAt) {
      await queryInterface.addColumn('SalePayments', 'paidAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // Modify paymentMethod to accept the new options
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'mysql' || dialect === 'mariadb') {
      await queryInterface.sequelize.query(`
        ALTER TABLE SalePayments MODIFY COLUMN paymentMethod VARCHAR(50) NOT NULL;
      `);
    } else {
      await queryInterface.changeColumn('SalePayments', 'paymentMethod', {
        type: Sequelize.STRING(50),
        allowNull: false
      });
    }

    // Add foreign key constraint to Shops if not present
    try {
      await queryInterface.addConstraint('SalePayments', {
        fields: ['shopId'],
        type: 'foreign key',
        name: 'fk_salepayments_shopId',
        references: {
          table: 'Shops',
          field: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (err) {
      // Ignore if constraint already exists
    }

    // Make processedBy nullable to avoid crash on user checkout
    if (tableInfo.processedBy) {
      await queryInterface.changeColumn('SalePayments', 'processedBy', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Employees',
          key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('SalePayments');
    if (tableInfo.gatewayRef) {
      await queryInterface.removeColumn('SalePayments', 'gatewayRef');
    }
    if (tableInfo.paidAt) {
      await queryInterface.removeColumn('SalePayments', 'paidAt');
    }
    try {
      await queryInterface.removeConstraint('SalePayments', 'fk_salepayments_shopId');
    } catch (err) {
      // Ignore if constraint doesn't exist
    }
  }
};
