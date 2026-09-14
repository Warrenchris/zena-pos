const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  priceMonthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'KES'
  },
  maxShops: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  maxUsers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2
  },
  features: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'Plans',
  timestamps: true
});

module.exports = Plan;
