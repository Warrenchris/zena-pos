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
  productId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Products',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  refundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  refundMethod: {
    type: DataTypes.ENUM('cash', 'card', 'mobile_money', 'store_credit'),
    allowNull: false,
    defaultValue: 'cash'
  },
  processedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Employees',
      key: 'id'
    }
  },
  refundedBy: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'processed', 'failed'),
    defaultValue: 'processed'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true
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
  SaleRefund.belongsTo(models.Product, {
    foreignKey: 'productId',
    as: 'product'
  });
};

module.exports = SaleRefund;