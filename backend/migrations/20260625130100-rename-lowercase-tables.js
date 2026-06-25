'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Rename tables to PascalCase
    await queryInterface.renameTable('invoices', 'Invoices');
    await queryInterface.renameTable('invoice_items', 'InvoiceItems');
    await queryInterface.renameTable('stores', 'Stores');
    
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Revert table names to lowercase
    await queryInterface.renameTable('Invoices', 'invoices');
    await queryInterface.renameTable('InvoiceItems', 'invoice_items');
    await queryInterface.renameTable('Stores', 'stores');
    
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};
