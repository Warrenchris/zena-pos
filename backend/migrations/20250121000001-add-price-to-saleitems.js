'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableInfo = await queryInterface.describeTable('SaleItems');
      if (!tableInfo.price) {
        await queryInterface.addColumn('SaleItems', 'price', {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: null
        });
        console.log('Successfully added price column to SaleItems table');
      } else {
        console.log('Price column already exists in SaleItems table, skipping.');
      }
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
