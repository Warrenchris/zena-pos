const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CreditNoteSequence = sequelize.define('CreditNoteSequence', {
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
  }
}, {
  tableName: 'CreditNoteSequences',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['shopId', 'date'],
      name: 'unique_shop_date_credit_note_sequence'
    }
  ]
});

module.exports = CreditNoteSequence;
