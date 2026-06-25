'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Drop the empty duplicate table RolePermission (singular) that Sequelize auto-sync created
    await queryInterface.dropTable('RolePermission').catch(() => {});

    // 2. Run an UPDATE query to backfill categoryId on any products where it is currently NULL,
    // by joining on Categories.name matched against the product's SKU prefix.
    await queryInterface.sequelize.query(`
      UPDATE Products p
      JOIN Categories c ON p.shopId = c.shopId AND c.name = 
        CASE 
          WHEN p.sku LIKE 'ELEC%' THEN 'Electronics'
          WHEN p.sku LIKE 'CLO%' THEN 'Clothing'
          WHEN p.sku LIKE 'GRO%' THEN 'Groceries'
          WHEN p.sku LIKE 'STA%' THEN 'Stationery'
        END
      SET p.categoryId = c.id
      WHERE p.categoryId IS NULL;
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // The down function is a no-op
  }
};
