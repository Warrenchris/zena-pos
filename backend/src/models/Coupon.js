const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    defaultValue: 'percentage'
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  minSpend: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  maxDiscount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  usageLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  usedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  perUserLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 1
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
  tableName: 'Coupons',
  timestamps: true,
  indexes: [
    {
      name: 'idx_coupons_code',
      fields: ['code']
    },
    {
      name: 'idx_coupons_shop_id',
      fields: ['shopId']
    }
  ]
});

module.exports = Coupon;
