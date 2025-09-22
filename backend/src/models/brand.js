'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Brand extends Model {
    static associate(models) {
      Brand.belongsTo(models.Shop, {
        foreignKey: 'shopId',
        as: 'shop'
      });
      Brand.hasMany(models.Product, {
        foreignKey: 'brandId',
        as: 'products'
      });
    }
  }

  Brand.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true
      }
    },
    logo: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isUrl: true
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
    modelName: 'Brand',
    tableName: 'Brands',
    timestamps: true
  });

  return Brand;
};