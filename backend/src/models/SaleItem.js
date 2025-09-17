const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Sale = require('./Sale');
const Product = require('./Product');

const SaleItem = sequelize.define('SaleItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  }
});

// Relationships
SaleItem.belongsTo(Sale);
SaleItem.belongsTo(Product);
Sale.hasMany(SaleItem);
Product.hasMany(SaleItem);

module.exports = SaleItem;
