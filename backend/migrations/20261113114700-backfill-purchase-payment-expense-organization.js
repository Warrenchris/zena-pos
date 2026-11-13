'use strict';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE Expenses e INNER JOIN Shops s ON s.id = e.shopId
      SET e.organizationId = s.organizationId
      WHERE e.organizationId IS NULL AND e.category = 'inventory'
        AND EXISTS (SELECT 1 FROM Purchases p WHERE p.shopId = e.shopId AND p.referenceNo = e.reference);
    `);
  },

  down: async () => {
    // No-op: the organization backfill is not safely reversible.
  }
};
