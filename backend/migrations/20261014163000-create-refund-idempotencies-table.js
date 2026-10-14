'use strict';

/**
 * Migration: Create RefundIdempotencies Table (Stage 3F.1)
 *
 * Provides database-enforced idempotency for refund operations with:
 * - Unique composite constraint on (shopId, idempotencyKey)
 * - Safe foreign keys referencing Shops and Sales with ON DELETE RESTRICT
 * - Full response replay payload caching
 * - Non-destructive, zero-downtime table creation
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    await queryInterface.createTable('RefundIdempotencies', {
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
        onDelete: 'RESTRICT'
      },
      saleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Sales',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      idempotencyKey: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      requestFingerprint: {
        type: DataTypes.STRING(64),
        allowNull: false
      },
      refundIds: {
        type: DataTypes.JSON,
        allowNull: false
      },
      responsePayload: {
        type: DataTypes.JSON,
        allowNull: false
      },
      saleStatus: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      totalRefundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      totalTaxRefunded: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('RefundIdempotencies', ['shopId', 'idempotencyKey'], {
      name: 'unique_refund_idempotency_shop_key',
      unique: true
    });

    await queryInterface.addIndex('RefundIdempotencies', ['saleId'], {
      name: 'idx_refund_idempotency_sale_id'
    });

    await queryInterface.addIndex('RefundIdempotencies', ['shopId', 'createdAt'], {
      name: 'idx_refund_idempotency_shop_createdAt'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('RefundIdempotencies');
  }
};
