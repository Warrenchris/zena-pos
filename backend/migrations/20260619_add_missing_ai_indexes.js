'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addIndex('Expenses', ['shopId', 'createdAt'], { name: 'idx_expenses_shop_createdAt', using: 'BTREE' });
    await queryInterface.addIndex('SaleItems', ['productId'], { name: 'idx_saleItems_productId', using: 'BTREE' });
    await queryInterface.addIndex('Products', ['shopId', 'stockQuantity'], { name: 'idx_products_shop_stockQuantity', using: 'BTREE' });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('Expenses', 'idx_expenses_shop_createdAt');
    await queryInterface.removeIndex('SaleItems', 'idx_saleItems_productId');
    await queryInterface.removeIndex('Products', 'idx_products_shop_stockQuantity');
  }
};