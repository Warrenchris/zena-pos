'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Unit extends Model {
    static associate(models) {
      Unit.belongsTo(models.Shop, {
        foreignKey: 'shopId',
        as: 'shop'
      });
      Unit.hasMany(models.Product, {
        foreignKey: 'unitId',
        as: 'products'
      });
    }
  }

  Unit.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    abbreviation: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 10]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    conversionRate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 1.0000,
      validate: {
        isDecimal: true,
        min: 0.0001
      }
    },
    shopId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Shops',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Unit',
    tableName: 'Units',
    timestamps: true
  });

  return Unit;
};