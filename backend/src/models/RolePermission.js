const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Permission = require('./Permission');

const RolePermission = sequelize.define('RolePermission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  role: {
    type: DataTypes.ENUM('admin', 'manager', 'cashier'),
    allowNull: false
  },
  permissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Permission,
      key: 'id'
    }
  }
}, {
  // Prevent Sequelize from pluralizing table name
  freezeTableName: true
});

// Set up associations with specific foreign key
RolePermission.belongsTo(Permission, {
  foreignKey: 'permissionId', // Use the existing permissionId column
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

module.exports = RolePermission;