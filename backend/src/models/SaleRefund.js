const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SaleRefund = sequelize.define('SaleRefund', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Sales',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  refundMethod: {
    type: DataTypes.ENUM('cash', 'card', 'mobile_money', 'store_credit'),
    allowNull: false
  },
  processedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Employees',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('pending', 'processed', 'failed'),
    defaultValue: 'pending'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true,
  indexes: [
    {
      name: 'idx_refunds_sale_id',
      fields: ['saleId']
    },
    {
      name: 'idx_refunds_status',
      fields: ['status']
    }
  ]
});

// Associations
SaleRefund.associate = (models) => {
  SaleRefund.belongsTo(models.Sale, {
    foreignKey: 'saleId',
    as: 'sale'
  });
  
  SaleRefund.belongsTo(models.Employee, {
    foreignKey: 'processedBy',
    as: 'processor'
  });
};

module.exports = SaleRefund;