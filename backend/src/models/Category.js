const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'id'
    }
  }
}, {
  hooks: {
    beforeValidate: async (category) => {
      if (!category.organizationId && category.shopId) {
        const Shop = sequelize.models.Shop || require('./Shop');
        const shop = await Shop.findByPk(category.shopId);
        if (shop && shop.organizationId) {
          category.organizationId = shop.organizationId;
        }
      }
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['organizationId', 'name'],
      name: 'unique_categories_org_name'
    },
    {
      unique: true,
      fields: ['shopId', 'name'],
      name: 'unique_categories_shop_name'
    }
  ]
});

module.exports = Category;
