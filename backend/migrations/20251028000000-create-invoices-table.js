'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Guard: skip if invoices table already exists (will be handled by a later migration)
    try {
      await queryInterface.createTable('invoices', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        invoiceNumber: { type: Sequelize.STRING, unique: true, allowNull: false },
        saleId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Sales', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        customerId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Customers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        issuerId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'Users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        shopId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'Shops', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        status: { type: Sequelize.ENUM('draft', 'pending', 'paid', 'overdue', 'cancelled'), defaultValue: 'pending' },
        subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        tax: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        discount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
        total: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        notes: { type: Sequelize.TEXT },
        dueDate: { type: Sequelize.DATE },
        paymentMethod: { type: Sequelize.STRING },
        paymentDate: { type: Sequelize.DATE },
        emailSentAt: { type: Sequelize.DATE },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      try { await queryInterface.addIndex('invoices', ['invoiceNumber']); } catch (e) {}
      try { await queryInterface.addIndex('invoices', ['status']); } catch (e) {}
      try { await queryInterface.addIndex('invoices', ['customerId']); } catch (e) {}
      try { await queryInterface.addIndex('invoices', ['saleId']); } catch (e) {}
      try { await queryInterface.addIndex('invoices', ['issuerId']); } catch (e) {}
      try { await queryInterface.addIndex('invoices', ['shopId']); } catch (e) {}
      try { await queryInterface.addIndex('invoices', ['createdAt']); } catch (e) {}
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table invoices already exists (20251028), skipping');
    }
  },

  down: async (queryInterface, Sequelize) => {
    try { await queryInterface.dropTable('invoices'); } catch (err) {}
  }
};