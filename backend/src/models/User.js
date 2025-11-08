const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const RolePermission = require('./RolePermission');
const Permission = require('./Permission');
const permissionCache = require('../services/permissionCache');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
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
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'cashier', 'manager'),
    defaultValue: 'cashier'
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
  }
}, {
  hooks: {
    beforeValidate: async (user) => {
      if (user.role && !['admin', 'manager', 'cashier'].includes(user.role)) {
        throw new Error('Invalid role specified');
      }
    },
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, 8);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, 8);
      }
      // Invalidate user cache if role changes
      if (user.changed('role')) {
        permissionCache.invalidateUserCache(user.id);
        permissionCache.invalidateRoleCache(user.role);
        // Also invalidate old role cache if role was changed
        if (user.previous('role')) {
          permissionCache.invalidateRoleCache(user.previous('role'));
        }
      }
    },
    afterUpdate: async (user) => {
      // Invalidate user cache after update (in case role or other relevant fields changed)
      permissionCache.invalidateUserCache(user.id);
    },
    afterDestroy: async (user) => {
      // Invalidate user cache when user is deleted
      permissionCache.invalidateUserCache(user.id);
    }
  }
});

User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Instance method to check permissions (uses cache)
User.prototype.hasPermission = async function(permissionName) {
  return permissionCache.userHasPermission(this.id, this.role, permissionName);
};

// Instance method to get all permissions (uses cache)
User.prototype.getPermissions = async function() {
  return permissionCache.getUserPermissions(this.id, this.role);
};

module.exports = User;
