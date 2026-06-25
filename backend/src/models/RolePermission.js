const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Permission = require('./Permission');
const permissionCache = require('../services/permissionCache');

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
  tableName: 'RolePermissions',
  hooks: {
    afterCreate: async (rolePermission) => {
      // Invalidate role cache when a new permission is assigned
      await permissionCache.invalidateRoleCache(rolePermission.role);
      permissionCache.invalidateAllUserCaches(); // Users with this role need cache refresh
    },
    afterUpdate: async (rolePermission) => {
      // Invalidate role cache when permission assignment is updated
      await permissionCache.invalidateRoleCache(rolePermission.role);
      // Also invalidate old role if role was changed
      if (rolePermission.previous('role')) {
        await permissionCache.invalidateRoleCache(rolePermission.previous('role'));
      }
      permissionCache.invalidateAllUserCaches(); // Users with this role need cache refresh
    },
    afterDestroy: async (rolePermission) => {
      // Invalidate role cache when a permission is removed
      await permissionCache.invalidateRoleCache(rolePermission.role);
      permissionCache.invalidateAllUserCaches(); // Users with this role need cache refresh
    }
  }
});

// Set up associations with specific foreign key
RolePermission.belongsTo(Permission, {
  foreignKey: 'permissionId', // Use the existing permissionId column
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

module.exports = RolePermission;