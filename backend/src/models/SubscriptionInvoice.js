const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SubscriptionInvoice = sequelize.define('SubscriptionInvoice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'id'
    }
  },
  subscriptionId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Subscriptions',
      key: 'id'
    }
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Plans',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'KES'
  },
  billingPeriodStart: {
    type: DataTypes.DATE,
    allowNull: true
  },
  billingPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: true
  },
  paymentChannel: {
    type: DataTypes.ENUM('mpesa', 'card', 'bank_transfer', 'manual'),
    allowNull: false
  },
  paymentReference: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  gatewayReference: {
    type: DataTypes.STRING(200),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    allowNull: false,
    defaultValue: 'pending'
  },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'SubscriptionInvoices',
  timestamps: true,
  indexes: [
    {
      name: 'idx_sub_invoices_org_id',
      fields: ['organizationId']
    },
    {
      name: 'idx_sub_invoices_reference',
      fields: ['paymentReference']
    }
  ]
});

module.exports = SubscriptionInvoice;
