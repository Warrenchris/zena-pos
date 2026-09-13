'use strict';

/**
 * FINDING-12 Sub-Phase 3C Migration:
 * Drops legacy Products.stockQuantity and Products.reorderPoint columns.
 *
 * NOTE ON DOWN MIGRATION / REVERSIBILITY:
 * The down() migration re-adds 'stockQuantity' and 'reorderPoint' as nullable columns
 * with their historical defaults (0 and 10). However, once dropped, the historical
 * per-product stock values cannot be restored to the Products table from Products itself.
 * In this post-split architecture, true stock counts reside exclusively in the branch-scoped
 * 'Inventory' table. Re-populating Products from Inventory would require an explicit join
 * on (productId, shopId) which is lossy for multi-branch organizations. This is an
 * acknowledged one-way schema transition.
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if columns exist before dropping (safe for idempotency)
    const tableInfo = await queryInterface.describeTable('Products');

    if (tableInfo.stockQuantity) {
      await queryInterface.removeColumn('Products', 'stockQuantity');
    }

    if (tableInfo.reorderPoint) {
      await queryInterface.removeColumn('Products', 'reorderPoint');
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Products');

    if (!tableInfo.stockQuantity) {
      await queryInterface.addColumn('Products', 'stockQuantity', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      });
    }

    if (!tableInfo.reorderPoint) {
      await queryInterface.addColumn('Products', 'reorderPoint', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 10
      });
    }
  }
};
