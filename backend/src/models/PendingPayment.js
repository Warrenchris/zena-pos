const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PendingPayment = sequelize.define('PendingPayment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  checkoutRequestId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  orderId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'failed'),
    allowNull: false,
    defaultValue: 'pending'
  },
  paymentChannel: {
    type: DataTypes.ENUM('mpesa', 'card'),
    allowNull: false
  },
  saleData: {
    type: DataTypes.JSON,
    allowNull: true
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
  timestamps: true
});

module.exports = PendingPayment;
