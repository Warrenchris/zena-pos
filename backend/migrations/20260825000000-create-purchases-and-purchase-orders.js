'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create Purchases table
    try {
      await queryInterface.createTable('Purchases', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        referenceNo: { type: Sequelize.STRING, allowNull: false },
        supplierName: { type: Sequelize.STRING, allowNull: false },
        supplierContact: { type: Sequelize.STRING, allowNull: true },
        purchaseDate: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        status: { type: Sequelize.ENUM('RECEIVED', 'PENDING', 'CANCELLED'), defaultValue: 'RECEIVED' },
        paymentStatus: { type: Sequelize.ENUM('PAID', 'PARTIAL', 'UNPAID'), defaultValue: 'PAID' },
        paymentMethod: { type: Sequelize.STRING, defaultValue: 'CASH' },
        totalAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
        notes: { type: Sequelize.TEXT, allowNull: true },
        items: { type: Sequelize.JSON, allowNull: false },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { engine: 'InnoDB' });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table Purchases already exists, skipping');
    }

    // referenceNo must be unique per shop, not globally, so two different shops
    // can both use e.g. "PUR-2026-0001" without colliding.
    try { await queryInterface.addIndex('Purchases', ['shopId', 'referenceNo'], { unique: true, name: 'purchases_shop_reference_unique' }); } catch (e) {}
    try { await queryInterface.addIndex('Purchases', ['shopId']); } catch (e) {}

    // 2. Create PurchaseOrders table
    try {
      await queryInterface.createTable('PurchaseOrders', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        poNumber: { type: Sequelize.STRING, allowNull: false },
        supplierName: { type: Sequelize.STRING, allowNull: false },
        supplierEmail: { type: Sequelize.STRING, allowNull: true },
        supplierPhone: { type: Sequelize.STRING, allowNull: true },
        orderDate: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        expectedDeliveryDate: { type: Sequelize.DATE, allowNull: true },
        status: { type: Sequelize.ENUM('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'), defaultValue: 'ORDERED' },
        totalAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
        notes: { type: Sequelize.TEXT, allowNull: true },
        items: { type: Sequelize.JSON, allowNull: false },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { engine: 'InnoDB' });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table PurchaseOrders already exists, skipping');
    }

    // poNumber must be unique per shop, not globally, for the same reason as above.
    try { await queryInterface.addIndex('PurchaseOrders', ['shopId', 'poNumber'], { unique: true, name: 'purchase_orders_shop_ponumber_unique' }); } catch (e) {}
    try { await queryInterface.addIndex('PurchaseOrders', ['shopId']); } catch (e) {}
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('PurchaseOrders');
    await queryInterface.dropTable('Purchases');
  }
};
