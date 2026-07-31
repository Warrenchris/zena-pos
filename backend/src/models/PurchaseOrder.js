const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PurchaseOrder = sequelize.define('PurchaseOrder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  poNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  supplierName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  supplierEmail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  supplierPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  orderDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expectedDeliveryDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'),
    defaultValue: 'ORDERED'
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
  tableName: 'PurchaseOrders',
  timestamps: true
});

module.exports = PurchaseOrder;
