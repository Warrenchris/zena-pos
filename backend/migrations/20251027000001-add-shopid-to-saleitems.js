'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('SaleItems');
    if (!tableInfo.shopId) {
      // First add the column without constraints
      await queryInterface.addColumn('SaleItems', 'shopId', {
        type: Sequelize.INTEGER,
        allowNull: true // temporarily allow null
      });
    }

    try {
      // Copy shopId from Sales to SaleItems
      await queryInterface.sequelize.query(`
        UPDATE SaleItems si
        INNER JOIN Sales s ON si.saleId = s.id
        SET si.shopId = s.shopId
      `);
    } catch (err) {
      // Ignore copy error if any
    }

    try {
      // Add index for performance
      await queryInterface.addIndex('SaleItems', ['shopId']);
    } catch (err) {
      // Ignore if index already exists
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('SaleItems');
    if (tableInfo.shopId) {
      await queryInterface.removeColumn('SaleItems', 'shopId');
    }
  }
};