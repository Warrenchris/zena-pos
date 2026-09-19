'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First add the column without constraints
    await queryInterface.addColumn('SaleItems', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: true // temporarily allow null
    });

    // Copy shopId from Sales to SaleItems
    await queryInterface.sequelize.query(`
      UPDATE SaleItems si
      INNER JOIN Sales s ON si.saleId = s.id
      SET si.shopId = s.shopId
    `);

    // Add index for performance
    await queryInterface.addIndex('SaleItems', ['shopId']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('SaleItems', 'shopId');
  }
};