const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Shop = require('./Shop');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  position: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  hireDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  salary: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  shopId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  }
}, {
  timestamps: true
});

// Relationship with Shop
Employee.belongsTo(Shop, { foreignKey: 'shopId' });
Shop.hasMany(Employee, { foreignKey: 'shopId' });

module.exports = Employee;