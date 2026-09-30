const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BillingNotificationLog = sequelize.define('BillingNotificationLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
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
    allowNull: true,
    references: {
      model: 'Subscriptions',
      key: 'id'
    }
  },
  invoiceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'SubscriptionInvoices',
      key: 'id'
    }
  },
  eventType: {
    type: DataTypes.STRING(60),
    allowNull: false
  },
  periodKey: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  recipientEmail: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  recipientName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('sent', 'failed', 'skipped'),
    allowNull: false,
    defaultValue: 'sent'
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'BillingNotificationLogs',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['organizationId', 'eventType', 'periodKey']
    },
    {
      fields: ['organizationId']
    },
    {
      fields: ['subscriptionId']
    },
    {
      fields: ['invoiceId']
    }
  ]
});

module.exports = BillingNotificationLog;
