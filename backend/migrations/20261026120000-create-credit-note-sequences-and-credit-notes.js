'use strict';

/**
 * Migration: Create CreditNoteSequences & CreditNotes Tables, and add creditNote columns to SaleRefunds
 *
 * Provides:
 * 1. CreditNoteSequences table: atomic, gapless credit note sequence generation per shop per day.
 *    Row locking with SELECT ... FOR UPDATE protects concurrent refunds.
 * 2. CreditNotes table: unique record of each issued credit note per shop, with UNIQUE (shopId, creditNoteNumber).
 * 3. SaleRefunds columns: creditNoteNumber & creditNoteId with index for fast item lookups.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // 1. Create CreditNoteSequences table if it doesn't exist
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map(t => typeof t === 'object' ? (t.tableName || Object.values(t)[0]) : t);

    if (!tableNames.includes('CreditNoteSequences')) {
      await queryInterface.createTable('CreditNoteSequences', {
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

      await queryInterface.addIndex('CreditNoteSequences', ['shopId', 'date'], {
        unique: true,
        name: 'unique_shop_date_credit_note_sequence'
      });
    }

    // 2. Create CreditNotes table if it doesn't exist
    if (!tableNames.includes('CreditNotes')) {
      await queryInterface.createTable('CreditNotes', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        creditNoteNumber: {
          type: DataTypes.STRING(32),
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
        saleId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'Sales',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        totalRefundAmount: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false
        },
        totalTaxRefunded: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.00
        },
        refundMethod: {
          type: DataTypes.STRING(32),
          allowNull: false,
          defaultValue: 'cash'
        },
        reason: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        processedBy: {
          type: DataTypes.STRING(36),
          allowNull: true
        },
        refundedBy: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        status: {
          type: DataTypes.ENUM('processed', 'cancelled'),
          allowNull: false,
          defaultValue: 'processed'
        },
        issuedAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true
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

      await queryInterface.addIndex('CreditNotes', ['shopId', 'creditNoteNumber'], {
        unique: true,
        name: 'unique_shop_credit_note_number'
      });

      await queryInterface.addIndex('CreditNotes', ['saleId'], {
        name: 'idx_credit_notes_sale_id'
      });

      await queryInterface.addIndex('CreditNotes', ['shopId', 'createdAt'], {
        name: 'idx_credit_notes_shop_created_at'
      });
    }

    // 3. Add columns to SaleRefunds if not present
    const refundDesc = await queryInterface.describeTable('SaleRefunds');

    if (!refundDesc.creditNoteNumber) {
      await queryInterface.addColumn('SaleRefunds', 'creditNoteNumber', {
        type: DataTypes.STRING(32),
        allowNull: true
      });
    }

    if (!refundDesc.creditNoteId) {
      await queryInterface.addColumn('SaleRefunds', 'creditNoteId', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }

    try {
      await queryInterface.addIndex('SaleRefunds', ['shopId', 'creditNoteNumber'], {
        name: 'idx_sale_refunds_shop_credit_note_number'
      });
    } catch (e) {
      // Index might already exist
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('SaleRefunds', 'idx_sale_refunds_shop_credit_note_number');
    } catch (e) {}

    const refundDesc = await queryInterface.describeTable('SaleRefunds');
    if (refundDesc.creditNoteId) {
      await queryInterface.removeColumn('SaleRefunds', 'creditNoteId');
    }
    if (refundDesc.creditNoteNumber) {
      await queryInterface.removeColumn('SaleRefunds', 'creditNoteNumber');
    }

    await queryInterface.dropTable('CreditNotes');
    await queryInterface.dropTable('CreditNoteSequences');
  }
};
