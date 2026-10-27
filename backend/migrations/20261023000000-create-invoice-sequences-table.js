'use strict';

/**
 * Migration: Create InvoiceSequences Table (Fix 7)
 *
 * Provides atomic, gapless sequence generation per shop per day.
 * Concurrency is guarded via SELECT ... FOR UPDATE on the shop+day sequence row.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('InvoiceSequences', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      shopId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Shops',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      date: {
        type: DataTypes.STRING(8),
        allowNull: false,
        comment: 'YYYYMMDD'
      },
      currentSequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('InvoiceSequences', ['shopId', 'date'], {
      unique: true,
      name: 'unique_shop_date_invoice_sequence'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('InvoiceSequences');
  }
};
