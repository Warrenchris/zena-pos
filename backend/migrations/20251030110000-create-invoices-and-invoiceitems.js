'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // invoices table is already created by 20251030000002-create-invoice-table-v2 with INTEGER id
    // Just ensure invoice_items exists with matching INTEGER invoiceId
    try {
      await queryInterface.createTable('invoice_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        invoiceId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'invoices', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        productId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Products', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        quantity: { type: Sequelize.INTEGER, allowNull: false },
        price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        total: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table invoice_items already exists, skipping');
    }
  },

  down: async (queryInterface, Sequelize) => {
    try { await queryInterface.dropTable('invoice_items'); } catch (err) {}
  }
};
