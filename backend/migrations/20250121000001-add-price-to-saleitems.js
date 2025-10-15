'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Add price column to SaleItems table
      await queryInterface.addColumn('SaleItems', 'price', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: null
      });

      console.log('Successfully added price column to SaleItems table');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Remove price column from SaleItems table
      await queryInterface.removeColumn('SaleItems', 'price');
      console.log('Successfully removed price column from SaleItems table');
    } catch (error) {
      console.error('Migration rollback failed:', error);
      throw error;
    }
  }
};
