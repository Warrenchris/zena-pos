const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Customer = require('./Customer');
const Employee = require('./Employee');

const Sale = sequelize.define('Sale', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true
  },
  // Basic sale information
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  tax: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: true
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // Payment tracking
  paymentMethod: {
    type: DataTypes.ENUM('cash', 'card', 'mobile', 'mobile_money', 'check', 'store_credit'),
    allowNull: false,
    defaultValue: 'cash'
  },
  paymentAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  change: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0
  },
  paymentReference: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paymentProvider: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paymentNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Customer experience
  customerNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deliveryAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deliveryInstructions: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  preferredLanguage: {
    type: DataTypes.STRING(5),
    allowNull: true,
    defaultValue: 'en'
  },
  // Business operations
  source: {
    type: DataTypes.ENUM('pos', 'online', 'phone', 'mobile_app'),
    defaultValue: 'pos'
  },
  saleStatus: {
    type: DataTypes.ENUM(
      'pending', 
      'confirmed', 
      'processing', 
      'completed', 
      'cancelled', 
      'refunded', 
      'partially_refunded'
    ),
    defaultValue: 'completed'
  },
  fulfillmentStatus: {
    type: DataTypes.ENUM(
      'pending', 
      'processing', 
      'ready', 
      'delivered', 
      'collected', 
      'failed'
    ),
    defaultValue: 'collected'
  },
  // Metadata and tracking
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  refundedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  lastModifiedBy: {
    type: DataTypes.UUID,
    allowNull: true
  },
  // Customer information (denormalized for quick access)
  customerName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerLocation: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Foreign keys and references
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Employees',
      key: 'id'
    }
  }
});

// Relationships
Sale.belongsTo(User);
Sale.belongsTo(Customer);
Sale.belongsTo(Employee, { foreignKey: 'employeeId' });
User.hasMany(Sale);
Customer.hasMany(Sale);
Employee.hasMany(Sale, { foreignKey: 'employeeId' });

module.exports = Sale;
