'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Check if any NULL values exist in SaleItems.productId
    const [results] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM SaleItems WHERE productId IS NULL'
    );
    const count = results[0] ? results[0].count : 0;
    if (count > 0) {
      console.warn(`[WARNING] Found ${count} rows in SaleItems with NULL productId!`);
    }

    // 2. Enforce NOT NULL on SaleItems.productId using raw SQL (reliable for MySQL with foreign keys)
    await queryInterface.sequelize.query('ALTER TABLE SaleItems MODIFY COLUMN productId INT NOT NULL');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('ALTER TABLE SaleItems MODIFY COLUMN productId INT NULL');
  }
};
