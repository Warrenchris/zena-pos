'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Helper function to check if index exists
      const indexExists = async (tableName, indexName) => {
        const indexes = await queryInterface.sequelize.query(
          `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`,
          { replacements: [indexName], transaction }
        );
        return indexes[0] && indexes[0].length > 0;
      };

      // Helper function to check if column exists
      const columnExists = async (tableName, columnName) => {
        const columns = await queryInterface.sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ? AND TABLE_SCHEMA = DATABASE()`,
          { replacements: [tableName, columnName], transaction }
        );
        return columns[0] && columns[0].length > 0;
      };

      // Sales table indexes
      if (!(await indexExists('Sales', 'idx_sales_shop_createdAt'))) {
        await queryInterface.addIndex('Sales', {
          fields: ['shopId', 'createdAt'],
          name: 'idx_sales_shop_createdAt',
          transaction
        });
      }
      
      // Only add status index if column exists
      if ((await columnExists('Sales', 'status')) && !(await indexExists('Sales', 'idx_sales_shop_status'))) {
        await queryInterface.addIndex('Sales', {
          fields: ['shopId', 'status'],
          name: 'idx_sales_shop_status',
          transaction
        });
      }

      // SaleItems table indexes
      if (!(await indexExists('SaleItems', 'idx_saleItems_saleId'))) {
        await queryInterface.addIndex('SaleItems', {
          fields: ['saleId'],
          name: 'idx_saleItems_saleId',
          transaction
        });
      }

      // Customers table indexes
      if (!(await indexExists('Customers', 'idx_customers_shop_createdAt'))) {
        await queryInterface.addIndex('Customers', {
          fields: ['shopId', 'createdAt'],
          name: 'idx_customers_shop_createdAt',
          transaction
        });
      }

      // ActivityLog table indexes
      if (!(await indexExists('ActivityLogs', 'idx_activityLogs_shop_createdAt'))) {
        await queryInterface.addIndex('ActivityLogs', {
          fields: ['shopId', 'createdAt'],
          name: 'idx_activityLogs_shop_createdAt',
          transaction
        });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('Sales', 'idx_sales_shop_createdAt', { transaction });
      await queryInterface.removeIndex('Sales', 'idx_sales_shop_status', { transaction });
      await queryInterface.removeIndex('SaleItems', 'idx_saleItems_saleId', { transaction });
      await queryInterface.removeIndex('Customers', 'idx_customers_shop_createdAt', { transaction });
      await queryInterface.removeIndex('ActivityLogs', 'idx_activityLogs_shop_createdAt', { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
