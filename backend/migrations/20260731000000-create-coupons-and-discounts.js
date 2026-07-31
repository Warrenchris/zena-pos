'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create Coupons table
    try {
      await queryInterface.createTable('Coupons', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
        title: { type: Sequelize.STRING, allowNull: false },
        discountType: { type: Sequelize.ENUM('percentage', 'fixed'), defaultValue: 'percentage' },
        discountValue: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        minSpend: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0.00 },
        maxDiscount: { type: Sequelize.DECIMAL(10, 2), allowNull: true },
        usageLimit: { type: Sequelize.INTEGER, defaultValue: 100 },
        usedCount: { type: Sequelize.INTEGER, defaultValue: 0 },
        perUserLimit: { type: Sequelize.INTEGER, defaultValue: 1 },
        startDate: { type: Sequelize.DATEONLY, allowNull: true },
        endDate: { type: Sequelize.DATEONLY, allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
        description: { type: Sequelize.TEXT, allowNull: true },
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
      console.log('Table Coupons already exists, skipping');
    }

    try { await queryInterface.addIndex('Coupons', ['code']); } catch (e) {}
    try { await queryInterface.addIndex('Coupons', ['shopId']); } catch (e) {}

    // 2. Create DiscountRules table
    try {
      await queryInterface.createTable('DiscountRules', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        ruleType: { type: Sequelize.ENUM('percentage', 'fixed', 'bulk', 'bogo'), defaultValue: 'percentage' },
        discountValue: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0.00 },
        scope: { type: Sequelize.ENUM('storewide', 'category', 'product'), defaultValue: 'storewide' },
        targetName: { type: Sequelize.STRING, defaultValue: 'All Products' },
        targetId: { type: Sequelize.INTEGER, allowNull: true },
        minQuantity: { type: Sequelize.INTEGER, defaultValue: 1 },
        minAmount: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0.00 },
        startDate: { type: Sequelize.DATEONLY, allowNull: true },
        endDate: { type: Sequelize.DATEONLY, allowNull: true },
        isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
        description: { type: Sequelize.TEXT, allowNull: true },
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
      console.log('Table DiscountRules already exists, skipping');
    }

    try { await queryInterface.addIndex('DiscountRules', ['shopId']); } catch (e) {}
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('DiscountRules');
    await queryInterface.dropTable('Coupons');
  }
};
