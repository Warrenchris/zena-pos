'use strict';

/**
 * Migration: Add Receipt Redesign Fields to Sales and SystemSettings (Phase 2)
 *
 * Sales table:
 * - receiptNumber: VARCHAR(32) NULL
 * - cashierName: VARCHAR(120) NULL
 * - taxAmount: DECIMAL(10,2) NULL
 * - taxInclusive: BOOLEAN NULL
 * - changeAmount: DECIMAL(10,2) NULL
 * - UNIQUE composite constraint: (shopId, receiptNumber)
 *
 * SystemSettings table:
 * - branch: VARCHAR(100) NULL
 * - tagline: VARCHAR(255) NULL
 * - showPoweredBy: BOOLEAN NOT NULL DEFAULT 1
 * - qrEnabled: BOOLEAN NOT NULL DEFAULT 0
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // 1. Sales table columns
    const [salesCols] = await queryInterface.sequelize.query("SHOW COLUMNS FROM `Sales`;").catch(() => [[]]);
    const existingSalesColNames = new Set(salesCols.map(c => c.Field));

    if (!existingSalesColNames.has('receiptNumber')) {
      await queryInterface.addColumn('Sales', 'receiptNumber', {
        type: DataTypes.STRING(32),
        allowNull: true
      });
    }

    if (!existingSalesColNames.has('cashierName')) {
      await queryInterface.addColumn('Sales', 'cashierName', {
        type: DataTypes.STRING(120),
        allowNull: true
      });
    }

    if (!existingSalesColNames.has('taxAmount')) {
      await queryInterface.addColumn('Sales', 'taxAmount', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
      });
    }

    if (!existingSalesColNames.has('taxInclusive')) {
      await queryInterface.addColumn('Sales', 'taxInclusive', {
        type: DataTypes.BOOLEAN,
        allowNull: true
      });
    }

    if (!existingSalesColNames.has('changeAmount')) {
      await queryInterface.addColumn('Sales', 'changeAmount', {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
      });
    }

    // Add unique index on (shopId, receiptNumber) if not present
    const [indexes] = await queryInterface.sequelize.query("SHOW INDEX FROM `Sales` WHERE Key_name = 'unique_sales_shop_receipt_number';").catch(() => [[]]);
    if (indexes.length === 0) {
      await queryInterface.addIndex('Sales', ['shopId', 'receiptNumber'], {
        unique: true,
        name: 'unique_sales_shop_receipt_number'
      }).catch(err => {
        console.warn('Index unique_sales_shop_receipt_number already exists or skipped:', err.message);
      });
    }

    // 2. SystemSettings table columns
    const [settingsCols] = await queryInterface.sequelize.query("SHOW COLUMNS FROM `SystemSettings`;").catch(() => [[]]);
    const existingSettingsColNames = new Set(settingsCols.map(c => c.Field));

    if (!existingSettingsColNames.has('branch')) {
      await queryInterface.addColumn('SystemSettings', 'branch', {
        type: DataTypes.STRING(100),
        allowNull: true
      });
    }

    if (!existingSettingsColNames.has('tagline')) {
      await queryInterface.addColumn('SystemSettings', 'tagline', {
        type: DataTypes.STRING(255),
        allowNull: true
      });
    }

    if (!existingSettingsColNames.has('showPoweredBy')) {
      await queryInterface.addColumn('SystemSettings', 'showPoweredBy', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }

    if (!existingSettingsColNames.has('qrEnabled')) {
      await queryInterface.addColumn('SystemSettings', 'qrEnabled', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface) {
    // Remove Sales columns
    await queryInterface.removeIndex('Sales', 'unique_sales_shop_receipt_number').catch(() => {});
    await queryInterface.removeColumn('Sales', 'receiptNumber').catch(() => {});
    await queryInterface.removeColumn('Sales', 'cashierName').catch(() => {});
    await queryInterface.removeColumn('Sales', 'taxAmount').catch(() => {});
    await queryInterface.removeColumn('Sales', 'taxInclusive').catch(() => {});
    await queryInterface.removeColumn('Sales', 'changeAmount').catch(() => {});

    // Remove SystemSettings columns
    await queryInterface.removeColumn('SystemSettings', 'branch').catch(() => {});
    await queryInterface.removeColumn('SystemSettings', 'tagline').catch(() => {});
    await queryInterface.removeColumn('SystemSettings', 'showPoweredBy').catch(() => {});
    await queryInterface.removeColumn('SystemSettings', 'qrEnabled').catch(() => {});
  }
};
