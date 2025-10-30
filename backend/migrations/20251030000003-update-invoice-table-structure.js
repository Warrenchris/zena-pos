'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Add new columns first
      const columnsToAdd = {
        taxRate: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0,
          allowNull: false
        },
        paymentAmount: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true
        },
        change: {
          type: Sequelize.DECIMAL(10, 2),
          defaultValue: 0
        },
        customerLocation: {
          type: Sequelize.STRING,
          allowNull: true
        },
        customerPhone: {
          type: Sequelize.STRING,
          allowNull: true
        },
        customerEmail: {
          type: Sequelize.STRING,
          allowNull: true
        },
        source: {
          type: Sequelize.STRING,
          defaultValue: 'pos'
        },
        fulfillmentStatus: {
          type: Sequelize.STRING,
          defaultValue: 'collected'
        },
        processedAt: {
          type: Sequelize.DATE,
          allowNull: true
        },
        completedAt: {
          type: Sequelize.DATE,
          allowNull: true
        },
        cancelledAt: {
          type: Sequelize.DATE,
          allowNull: true
        },
        refundedAt: {
          type: Sequelize.DATE,
          allowNull: true
        }
      };

      for (const [columnName, columnDefinition] of Object.entries(columnsToAdd)) {
        await queryInterface.addColumn('invoices', columnName, columnDefinition, { transaction });
      }

      // Modify existing columns if needed
      await queryInterface.changeColumn('invoices', 'status', {
        type: Sequelize.STRING,
        defaultValue: 'completed'
      }, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      const columnsToRemove = [
        'taxRate',
        'paymentAmount',
        'change',
        'customerLocation',
        'customerPhone',
        'customerEmail',
        'source',
        'fulfillmentStatus',
        'processedAt',
        'completedAt',
        'cancelledAt',
        'refundedAt'
      ];

      for (const columnName of columnsToRemove) {
        await queryInterface.removeColumn('invoices', columnName, { transaction });
      }

      // Revert status column
      await queryInterface.changeColumn('invoices', 'status', {
        type: Sequelize.ENUM('draft', 'pending', 'paid', 'overdue', 'cancelled'),
        defaultValue: 'pending'
      }, { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};