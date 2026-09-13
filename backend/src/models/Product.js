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

// Auto-wrap hook: ensure organizationId is populated from shopId or default org
Product.beforeValidate(async (product, options) => {
  if (!product.organizationId) {
    if (product.shopId) {
      const Shop = sequelize.models.Shop || require('./Shop');
      const shop = await Shop.findByPk(product.shopId, { attributes: ['organizationId'], transaction: options?.transaction });
      if (shop && shop.organizationId) {
        product.organizationId = shop.organizationId;
      }
    }
    if (!product.organizationId) {
      const Org = sequelize.models.Organization || require('./Organization');
      const org = await Org.findOne({ attributes: ['id'], transaction: options?.transaction });
      if (org) {
        product.organizationId = org.id;
      }
    }
  }
});

// Auto-seed initial Inventory row for origin branch on direct Product creation (3A dual-write bridge)
Product.afterCreate(async (product, options) => {
  if (product.shopId) {
    const Inventory = sequelize.models.Inventory || require('./Inventory');
    try {
      await Inventory.findOrCreate({
        where: { shopId: product.shopId, productId: product.id },
        defaults: {
          shopId: product.shopId,
          productId: product.id,
          stockQuantity: product.stockQuantity || 0,
          reorderPoint: product.reorderPoint !== undefined ? product.reorderPoint : 10
        },
        transaction: options?.transaction
      });
    } catch (err) {
      // Non-fatal if table doesn't exist yet during initial setup
    }
  }
});

// Relationships are defined in models/index.js

module.exports = Product;
