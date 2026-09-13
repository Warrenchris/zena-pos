const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sku: {
    type: DataTypes.STRING,
    allowNull: false
  },
  barcode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  weightGrams: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  reorderPoint: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10
  },
  expirationDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  nonReturnable: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'id'
    }
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Shops',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['organizationId', 'sku'],
      name: 'unique_products_org_sku'
    },
    {
      unique: true,
      fields: ['organizationId', 'barcode'],
      name: 'unique_products_org_barcode'
    },
    {
      fields: ['organizationId', 'createdAt'],
      name: 'idx_products_org_createdAt'
    }
  ]
});

// Relationships are defined in models/index.js

module.exports = Product;
