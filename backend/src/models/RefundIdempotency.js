const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RefundIdempotency = sequelize.define('RefundIdempotency', {
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
  saleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Sales',
      key: 'id'
    }
  },
  idempotencyKey: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  requestFingerprint: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  refundIds: {
    type: DataTypes.JSON,
    allowNull: false
  },
  responsePayload: {
    type: DataTypes.JSON,
    allowNull: false
  },
  saleStatus: {
    type: DataTypes.STRING(32),
    allowNull: false
  },
  totalRefundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  totalTaxRefunded: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  }
}, {
  tableName: 'RefundIdempotencies',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['shopId', 'idempotencyKey'],
      name: 'unique_refund_idempotency_shop_key'
    },
    {
      fields: ['saleId'],
      name: 'idx_refund_idempotency_sale_id'
    },
    {
      fields: ['shopId', 'createdAt'],
      name: 'idx_refund_idempotency_shop_createdAt'
    }
  ]
});

RefundIdempotency.associate = (models) => {
  RefundIdempotency.belongsTo(models.Shop, { foreignKey: 'shopId' });
  RefundIdempotency.belongsTo(models.Sale, { foreignKey: 'saleId', as: 'sale' });
};

module.exports = RefundIdempotency;
