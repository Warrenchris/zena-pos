'use strict';

/**
 * Migration: Add receiptTokenHash to Sales table (Phase 5)
 *
 * Stores the SHA-256 hash of the client-generated 16-byte base64url receiptToken.
 * Column: receiptTokenHash CHAR(64) NULL, UNIQUE
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    const [salesCols] = await queryInterface.sequelize.query('SHOW COLUMNS FROM `Sales`;').catch(() => [[]]);
    const existingSalesColNames = new Set(salesCols.map((c) => c.Field));

    if (!existingSalesColNames.has('receiptTokenHash')) {
      await queryInterface.addColumn('Sales', 'receiptTokenHash', {
        type: DataTypes.CHAR(64),
        allowNull: true,
      });
    }

    // Check unique index on receiptTokenHash
    const [indexes] = await queryInterface.sequelize.query('SHOW INDEX FROM `Sales`;').catch(() => [[]]);
    const existingIndexNames = new Set(indexes.map((idx) => idx.Key_name));

    if (!existingIndexNames.has('sales_receipt_token_hash_unique') && !existingIndexNames.has('receiptTokenHash')) {
      await queryInterface.addIndex('Sales', ['receiptTokenHash'], {
        unique: true,
        name: 'sales_receipt_token_hash_unique',
      }).catch((err) => {
        // In case index was created automatically by column definition
        if (!err.message?.includes('Duplicate key name')) throw err;
      });
    }
  },

  async down(queryInterface) {
    const [indexes] = await queryInterface.sequelize.query('SHOW INDEX FROM `Sales`;').catch(() => [[]]);
    const existingIndexNames = new Set(indexes.map((idx) => idx.Key_name));

    if (existingIndexNames.has('sales_receipt_token_hash_unique')) {
      await queryInterface.removeIndex('Sales', 'sales_receipt_token_hash_unique').catch(() => {});
    }

    const [salesCols] = await queryInterface.sequelize.query('SHOW COLUMNS FROM `Sales`;').catch(() => [[]]);
    const existingSalesColNames = new Set(salesCols.map((c) => c.Field));

    if (existingSalesColNames.has('receiptTokenHash')) {
      await queryInterface.removeColumn('Sales', 'receiptTokenHash');
    }
  },
};
