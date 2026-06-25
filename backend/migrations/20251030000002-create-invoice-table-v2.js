'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Drop the invoices table if it exists since we're doing a complete restructure
    await queryInterface.dropTable('invoices').catch(() => {
      // Ignore error if table doesn't exist
    });

    // Create the new table structure — no FK references to avoid case-sensitivity issues
    await queryInterface.createTable('invoices', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      invoiceNumber: { type: Sequelize.STRING, allowNull: false, unique: true },
      subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      tax: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      taxRate: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      discount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      discountType: { type: Sequelize.STRING, allowNull: true },
      discountValue: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      total: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      paymentMethod: { type: Sequelize.STRING, allowNull: true },
      paymentAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
      change: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      paymentReference: { type: Sequelize.STRING, allowNull: true },
      paymentProvider: { type: Sequelize.STRING, allowNull: true },
      paymentNotes: { type: Sequelize.TEXT, allowNull: true },
      customerNotes: { type: Sequelize.TEXT, allowNull: true },
      deliveryAddress: { type: Sequelize.TEXT, allowNull: true },
      deliveryInstructions: { type: Sequelize.TEXT, allowNull: true },
      preferredLanguage: { type: Sequelize.STRING, defaultValue: 'en' },
      source: { type: Sequelize.STRING, defaultValue: 'pos' },
      status: { type: Sequelize.STRING, defaultValue: 'completed' },
      fulfillmentStatus: { type: Sequelize.STRING, defaultValue: 'collected' },
      metadata: { type: Sequelize.JSON, allowNull: true },
      tags: { type: Sequelize.JSON, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      processedAt: { type: Sequelize.DATE, allowNull: true },
      completedAt: { type: Sequelize.DATE, allowNull: true },
      cancelledAt: { type: Sequelize.DATE, allowNull: true },
      refundedAt: { type: Sequelize.DATE, allowNull: true },
      lastModifiedBy: { type: Sequelize.STRING, allowNull: true },
      customerName: { type: Sequelize.STRING, allowNull: true },
      customerLocation: { type: Sequelize.STRING, allowNull: true },
      customerPhone: { type: Sequelize.STRING, allowNull: true },
      customerEmail: { type: Sequelize.STRING, allowNull: true },
      shopId: { type: Sequelize.INTEGER, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: true },
      employeeId: { type: Sequelize.STRING(36), allowNull: true },
      customerId: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // Add indexes with error handling
    const indexColumns = [['invoiceNumber'], ['shopId'], ['customerId'], ['status'], ['createdAt'], ['employeeId']];
    for (const cols of indexColumns) {
      try {
        await queryInterface.addIndex('invoices', cols);
      } catch (error) {
        console.log(`Index on ${cols.join(',')} skipped:`, error.message);
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    try { await queryInterface.dropTable('invoices'); } catch (err) {}
  }
};