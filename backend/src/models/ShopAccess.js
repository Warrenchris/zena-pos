const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ShopAccess = sequelize.define('ShopAccess', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  membershipId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'OrganizationMemberships',
      key: 'id'
    }
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'ShopAccess',
  timestamps: true
});

module.exports = ShopAccess;
