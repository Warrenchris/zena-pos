const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CreditNote = sequelize.define('CreditNote', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
    defaultValue: 0.00
  },
  refundMethod: {
    type: DataTypes.STRING(32),
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
    defaultValue: 'processed'
  },
  issuedAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'CreditNotes',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['shopId', 'creditNoteNumber'],
      name: 'unique_shop_credit_note_number'
    },
    {
      name: 'idx_credit_notes_sale_id',
      fields: ['saleId']
    },
    {
      name: 'idx_credit_notes_shop_created_at',
      fields: ['shopId', 'createdAt']
    }
  ]
});

module.exports = CreditNote;
