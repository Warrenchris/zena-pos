const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SalePayment = sequelize.define('SalePayment', {
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
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'card', 'mobile', 'mobile_money', 'check', 'store_credit'),
    allowNull: false
  },
  paymentReference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paymentProvider: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
    defaultValue: 'completed'
  },
  processedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Employees',
      key: 'id'
    }
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
      name: 'idx_payments_sale_id',
      fields: ['saleId']
    },
    {
      name: 'idx_payments_status',
      fields: ['status']
    }
  ]
});

// Associations
SalePayment.associate = (models) => {
  SalePayment.belongsTo(models.Sale, {
    foreignKey: 'saleId',
    as: 'sale'
  });
  
  SalePayment.belongsTo(models.Employee, {
    foreignKey: 'processedBy',
    as: 'processor'
  });
};

module.exports = SalePayment;