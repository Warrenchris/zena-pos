'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('SaleRefunds');
    
    if (!tableInfo.productId) {
      await queryInterface.addColumn('SaleRefunds', 'productId', {
        type: Sequelize.STRING(36),
        allowNull: true,
        references: {
          model: 'Products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    
    if (!tableInfo.quantity) {
      await queryInterface.addColumn('SaleRefunds', 'quantity', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      });
    }
    
    if (!tableInfo.refundAmount) {
      await queryInterface.addColumn('SaleRefunds', 'refundAmount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }
    
    if (!tableInfo.refundedBy) {
      await queryInterface.addColumn('SaleRefunds', 'refundedBy', {
        type: Sequelize.STRING(36),
        allowNull: true
      });
    }
    
    if (!tableInfo.refundedAt) {
      await queryInterface.addColumn('SaleRefunds', 'refundedAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // Add partial_refund to Sales.saleStatus ENUM
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'mysql' || dialect === 'mariadb') {
      await queryInterface.sequelize.query(`
        ALTER TABLE Sales MODIFY COLUMN saleStatus ENUM('pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'partial_refund') NOT NULL DEFAULT 'completed';
      `);
    } else if (dialect === 'postgres') {
      try {
        await queryInterface.sequelize.query(`ALTER TYPE "enum_Sales_saleStatus" ADD VALUE 'partial_refund';`);
      } catch (err) {
        // Ignore if value already exists
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('SaleRefunds');
    
    if (tableInfo.productId) {
      await queryInterface.removeColumn('SaleRefunds', 'productId');
    }
    if (tableInfo.quantity) {
      await queryInterface.removeColumn('SaleRefunds', 'quantity');
    }
    if (tableInfo.refundAmount) {
      await queryInterface.removeColumn('SaleRefunds', 'refundAmount');
    }
    if (tableInfo.refundedBy) {
      await queryInterface.removeColumn('SaleRefunds', 'refundedBy');
    }
    if (tableInfo.refundedAt) {
      await queryInterface.removeColumn('SaleRefunds', 'refundedAt');
    }
  }
};
