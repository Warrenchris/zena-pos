const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Customer = require('./Customer');
const Employee = require('./Employee');

const Sale = sequelize.define('Sale', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'card', 'mobile', 'mobile_money', 'other'),
    allowNull: false
  },
  paymentAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  change: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  // Customer information fields for direct storage
  customerName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerLocation: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notes: {
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
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Employees',
      key: 'id'
    }
  }
});

// Relationships
Sale.belongsTo(User);
Sale.belongsTo(Customer);
Sale.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(Sale);
Customer.hasMany(Sale);
Employee.hasMany(Sale, { foreignKey: 'employeeId' });

module.exports = Sale;
