const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Invoice = require('./Invoice');
const Product = require('./Product');

const InvoiceItem = sequelize.define('InvoiceItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'invoices', key: 'id' },
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'Products', key: 'id' },
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: 'invoice_items',
});

// Associations
InvoiceItem.associate = (models) => {
  InvoiceItem.belongsTo(models.Invoice, {
    foreignKey: 'invoiceId',
    as: 'invoice'
  });
  InvoiceItem.belongsTo(models.Product, {
    foreignKey: 'productId',
    as: 'product'
  });
};

module.exports = InvoiceItem;
