'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('SaleRefunds', 'processedBy', {
      type: DataTypes.CHAR(36) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_bin',
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('SaleRefunds', 'processedBy', {
      type: DataTypes.STRING(36),
      allowNull: false
    });
  }
};
