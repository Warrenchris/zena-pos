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
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Sales',
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Products',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // Price tracking
  originalPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  unitPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  // Discount handling
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: true
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  // Tax handling
  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  taxAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  // Product tracking
  serialNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  batchNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Return handling
  returnReason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Additional information
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  indexes: [
    {
      name: 'idx_sale_items_product_id',
      fields: ['productId']
    },
    {
      name: 'idx_sale_items_sale_id',
      fields: ['saleId']
    }
  ]
});

// Relationships
SaleItem.belongsTo(Sale);
SaleItem.belongsTo(Product);
Sale.hasMany(SaleItem);
Product.hasMany(SaleItem);

module.exports = SaleItem;
