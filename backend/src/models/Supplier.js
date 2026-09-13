const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Supplier = sequelize.define('Supplier', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  contactPerson: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
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
  tableName: 'Suppliers',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['organizationId', 'name'],
      name: 'unique_suppliers_org_name'
    },
    {
      fields: ['organizationId', 'createdAt'],
      name: 'idx_suppliers_org_createdAt'
    }
  ]
});

Supplier.beforeValidate(async (supplier, options) => {
  if (!supplier.organizationId) {
    if (supplier.shopId) {
      const Shop = sequelize.models.Shop || require('./Shop');
      const shop = await Shop.findByPk(supplier.shopId, { attributes: ['organizationId'], transaction: options?.transaction });
      if (shop && shop.organizationId) {
        supplier.organizationId = shop.organizationId;
      }
    }
    if (!supplier.organizationId) {
      const Org = sequelize.models.Organization || require('./Organization');
      const org = await Org.findOne({ attributes: ['id'], transaction: options?.transaction });
      if (org) {
        supplier.organizationId = org.id;
      }
    }
  }
});

module.exports = Supplier;
