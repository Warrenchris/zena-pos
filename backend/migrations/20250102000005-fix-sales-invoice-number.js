'use strict';
/* eslint-env node */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.changeColumn('Sales', 'invoiceNumber', {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true
      });
    } catch (err) {
      console.log('changeColumn invoiceNumber skipped:', err.message);
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.changeColumn('Sales', 'invoiceNumber', {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      });
    } catch (err) {
      console.log('changeColumn invoiceNumber down skipped:', err.message);
    }
  }
};