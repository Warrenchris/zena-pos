const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlatformAuditLog = sequelize.define('PlatformAuditLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  actorUserId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fromStatus: {
    type: DataTypes.STRING,
    allowNull: true
  },
  toStatus: {
    type: DataTypes.STRING,
    allowNull: true
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'PlatformAuditLogs',
  timestamps: true,
  updatedAt: false
});

module.exports = PlatformAuditLog;
