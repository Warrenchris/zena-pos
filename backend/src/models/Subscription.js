const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'Organizations',
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
  status: {
    type: DataTypes.ENUM('trialing', 'active', 'past_due', 'canceled', 'suspended'),
    allowNull: false,
    defaultValue: 'trialing'
  },
  billingCycle: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  currentPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false
  },
  currentPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false
  },
  trialEndsAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  lastPaymentMethod: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  lastPaymentDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'Subscriptions',
  timestamps: true,
  indexes: [
    {
      name: 'idx_subscriptions_org_status',
      fields: ['organizationId', 'status']
    }
  ]
});

module.exports = Subscription;
