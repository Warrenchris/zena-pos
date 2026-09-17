const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockTransfer = sequelize.define('StockTransfer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'id'
    }
  },
  idempotencyKey: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  requestHash: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  reference: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  sourceShopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  destinationShopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Products',
      key: 'id'
    }
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  responsePayload: {
    type: DataTypes.JSON,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'COMPLETED'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  employeeId: {
    type: DataTypes.CHAR(36),
    allowNull: true,
    references: {
      model: 'Employees',
      key: 'id'
    }
  }
}, {
  tableName: 'StockTransfers',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['organizationId', 'idempotencyKey'],
      name: 'unique_stock_transfers_org_idempotency_key'
    },
    {
      fields: ['organizationId'],
      name: 'idx_stock_transfers_org'
    },
    {
      fields: ['sourceShopId'],
      name: 'idx_stock_transfers_source_shop'
    },
    {
      fields: ['destinationShopId'],
      name: 'idx_stock_transfers_dest_shop'
    }
  ]
});

module.exports = StockTransfer;
