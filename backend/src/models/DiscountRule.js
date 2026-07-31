const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DiscountRule = sequelize.define('DiscountRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ruleType: {
    type: DataTypes.ENUM('percentage', 'fixed', 'bulk', 'bogo'),
    defaultValue: 'percentage'
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  scope: {
    type: DataTypes.ENUM('storewide', 'category', 'product'),
    defaultValue: 'storewide'
  },
  targetName: {
    type: DataTypes.STRING,
    defaultValue: 'All Products'
  },
  targetId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  minQuantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  minAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  startDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  endDate: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  }
}, {
  tableName: 'DiscountRules',
  timestamps: true,
  indexes: [
    {
      name: 'idx_discount_rules_shop_id',
      fields: ['shopId']
    }
  ]
});

module.exports = DiscountRule;
