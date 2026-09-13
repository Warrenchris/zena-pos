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

module.exports = Supplier;
