const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const RolePermission = require('./RolePermission');
const Permission = require('./Permission');

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

User.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

// Instance method to check permissions
User.prototype.hasPermission = async function(permissionName) {
  if (this.role === 'admin') return true;
  
  const rolePermission = await RolePermission.findOne({
    include: [{
      model: Permission,
      where: { name: permissionName }
    }],
    where: { role: this.role }
  });

  return !!rolePermission;
};

// Instance method to get all permissions
User.prototype.getPermissions = async function() {
  const rolePermissions = await RolePermission.findAll({
    include: [Permission],
    where: { role: this.role }
  });

  return rolePermissions.map(rp => rp.Permission.name);
};

module.exports = User;
