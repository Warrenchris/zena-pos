const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HeldCart = sequelize.define('HeldCart', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  cashierId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  label: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  cartSnapshot: {
    type: DataTypes.JSON,
    allowNull: false
  },
  heldAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('held', 'recalled'),
    allowNull: false,
    defaultValue: 'held'
  }
}, {
  timestamps: true
});

module.exports = HeldCart;
