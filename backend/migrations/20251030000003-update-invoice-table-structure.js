'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Skip entirely if invoices table doesn't exist or columns already present
    try {
      const colInfo = await queryInterface.describeTable('invoices');

      const columnsToAdd = {
        taxRate: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0, allowNull: false },
        paymentAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
        change: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        customerLocation: { type: Sequelize.STRING, allowNull: true },
        customerPhone: { type: Sequelize.STRING, allowNull: true },
        customerEmail: { type: Sequelize.STRING, allowNull: true },
        source: { type: Sequelize.STRING, defaultValue: 'pos' },
        fulfillmentStatus: { type: Sequelize.STRING, defaultValue: 'collected' },
        processedAt: { type: Sequelize.DATE, allowNull: true },
        completedAt: { type: Sequelize.DATE, allowNull: true },
        cancelledAt: { type: Sequelize.DATE, allowNull: true },
        refundedAt: { type: Sequelize.DATE, allowNull: true }
      };

      for (const [columnName, columnDefinition] of Object.entries(columnsToAdd)) {
        if (!colInfo[columnName]) {
          try {
            await queryInterface.addColumn('invoices', columnName, columnDefinition);
          } catch (colErr) {
            console.log(`addColumn invoices.${columnName} skipped:`, colErr.message);
          }
        }
      }

      // Modify existing columns if needed
      try {
        await queryInterface.changeColumn('invoices', 'status', {
          type: Sequelize.STRING,
          defaultValue: 'completed'
        });
      } catch (err) {
        console.log('changeColumn invoices.status skipped:', err.message);
      }
    } catch (err) {
      console.log('20251030000003-update-invoice-table-structure skipped:', err.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      const colInfo = await queryInterface.describeTable('invoices');
      const columnsToRemove = [
        'taxRate', 'paymentAmount', 'change', 'customerLocation',
        'customerPhone', 'customerEmail', 'source', 'fulfillmentStatus',
        'processedAt', 'completedAt', 'cancelledAt', 'refundedAt'
      ];

      for (const columnName of columnsToRemove) {
        if (colInfo[columnName]) {
          try {
            await queryInterface.removeColumn('invoices', columnName);
          } catch (colErr) {
            console.log(`removeColumn invoices.${columnName} skipped:`, colErr.message);
          }
        }
      }

      try {
        await queryInterface.changeColumn('invoices', 'status', {
          type: Sequelize.ENUM('draft', 'pending', 'paid', 'overdue', 'cancelled'),
          defaultValue: 'pending'
        });
      } catch (err) {
        console.log('changeColumn invoices.status down skipped:', err.message);
      }
    } catch (err) {
      console.log('20251030000003 down skipped:', err.message);
    }
  }
};