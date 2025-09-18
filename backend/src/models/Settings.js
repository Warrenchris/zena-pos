const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Settings extends Model {
    static associate(models) {
      Settings.belongsTo(models.Shop, {
        foreignKey: 'shopId',
        as: 'shop'
      });
    }
  }

  Settings.init({
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
    theme: {
      type: DataTypes.JSON,
      defaultValue: {
        theme: 'light',
        primaryColor: '#3B82F6',
        sidebarStyle: 'expanded'
      }
    },
    regional: {
      type: DataTypes.JSON,
      defaultValue: {
        currency: 'USD',
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        language: 'en'
      }
    }
  }, {
    sequelize,
    modelName: 'Settings',
    tableName: 'settings',
    timestamps: true
  });

  return Settings;
};