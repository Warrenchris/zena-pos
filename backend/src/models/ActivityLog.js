const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const ActivityLog = sequelize.define('ActivityLog', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  action: { type: DataTypes.STRING, allowNull: false },
  entity: { type: DataTypes.STRING, allowNull: true },
  entityId: { type: DataTypes.STRING, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: true },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
}, { timestamps: true });

ActivityLog.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(ActivityLog, { foreignKey: 'userId' });

module.exports = ActivityLog;


