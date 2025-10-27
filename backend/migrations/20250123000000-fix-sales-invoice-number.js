'use strict';
/* eslint-env node */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Sales', 'invoiceNumber', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Sales', 'invoiceNumber', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    });
  }
};