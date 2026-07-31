const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Purchase = sequelize.define('Purchase', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  referenceNo: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  supplierName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  supplierContact: {
    type: DataTypes.STRING,
    allowNull: true
  },
  purchaseDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.ENUM('RECEIVED', 'PENDING', 'CANCELLED'),
    defaultValue: 'RECEIVED'
  },
  paymentStatus: {
    type: DataTypes.ENUM('PAID', 'PARTIAL', 'UNPAID'),
    defaultValue: 'PAID'
  },
  paymentMethod: {
    type: DataTypes.STRING,
    defaultValue: 'CASH'
  },
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  items: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: 'Purchases',
  timestamps: true
});

module.exports = Purchase;
