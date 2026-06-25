'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.addIndex('Expenses', ['shopId', 'createdAt'], { name: 'idx_expenses_shop_createdAt', using: 'BTREE' });
    } catch (err) { console.log('Index idx_expenses_shop_createdAt already exists, skipping'); }
    try {
      await queryInterface.addIndex('SaleItems', ['productId'], { name: 'idx_saleItems_productId', using: 'BTREE' });
    } catch (err) { console.log('Index idx_saleItems_productId already exists, skipping'); }
    try {
      await queryInterface.addIndex('Products', ['shopId', 'stockQuantity'], { name: 'idx_products_shop_stockQuantity', using: 'BTREE' });
    } catch (err) { console.log('Index idx_products_shop_stockQuantity already exists, skipping'); }
  },
  down: async (queryInterface, Sequelize) => {
    try { await queryInterface.removeIndex('Expenses', 'idx_expenses_shop_createdAt'); } catch (err) {}
    try { await queryInterface.removeIndex('SaleItems', 'idx_saleItems_productId'); } catch (err) {}
    try { await queryInterface.removeIndex('Products', 'idx_products_shop_stockQuantity'); } catch (err) {}
  }
};