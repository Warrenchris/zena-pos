const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StockMovement = sequelize.define('StockMovement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  previousStock: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  newStock: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('PURCHASE_RECEIPT', 'PURCHASE_REVERSAL', 'SALE', 'SALE_REFUND', 'ADJUSTMENT', 'TRANSFER'),
    allowNull: false
  },
  reference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
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
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Organizations',
      key: 'id'
    }
  }
}, {
  tableName: 'StockMovements',
  timestamps: true
});

module.exports = StockMovement;
