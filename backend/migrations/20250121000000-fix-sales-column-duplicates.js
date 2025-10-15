'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Check current table structure
      const tableInfo = await queryInterface.describeTable('Sales');
      console.log('Current Sales table columns:', Object.keys(tableInfo));

      // Fix CustomerId column name to match model (customerId)
      if (tableInfo.CustomerId && !tableInfo.customerId) {
        console.log('Renaming CustomerId to customerId...');
        await queryInterface.renameColumn('Sales', 'CustomerId', 'customerId');
      }

      // Ensure we have the correct userId column (lowercase)
      if (tableInfo.UserId && !tableInfo.userId) {
        console.log('Renaming UserId to userId...');
        await queryInterface.renameColumn('Sales', 'UserId', 'userId');
      }

      // If both UserId and userId exist, merge data and remove duplicate
      if (tableInfo.UserId && tableInfo.userId) {
        console.log('Merging UserId data into userId and removing duplicate...');
        await queryInterface.sequelize.query(`
          UPDATE Sales 
          SET userId = COALESCE(userId, UserId) 
          WHERE UserId IS NOT NULL
        `);
        await queryInterface.removeColumn('Sales', 'UserId');
      }

      // If both CustomerId and customerId exist, merge data and remove duplicate
      if (tableInfo.CustomerId && tableInfo.customerId) {
        console.log('Merging CustomerId data into customerId and removing duplicate...');
        await queryInterface.sequelize.query(`
          UPDATE Sales 
          SET customerId = COALESCE(customerId, CustomerId) 
          WHERE CustomerId IS NOT NULL
        `);
        await queryInterface.removeColumn('Sales', 'CustomerId');
      }

      console.log('Sales table column fixes completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Rollback: rename columns back to capitalized versions
      const tableInfo = await queryInterface.describeTable('Sales');
      
      if (tableInfo.customerId && !tableInfo.CustomerId) {
        await queryInterface.renameColumn('Sales', 'customerId', 'CustomerId');
      }
      
      if (tableInfo.userId && !tableInfo.UserId) {
        await queryInterface.renameColumn('Sales', 'userId', 'UserId');
      }
    } catch (error) {
      console.error('Migration rollback failed:', error);
      throw error;
    }
  }
};
