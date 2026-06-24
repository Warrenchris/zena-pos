'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add index for employeeId in Sales table
    try {
      await queryInterface.addIndex('Sales', ['employeeId'], {
        name: 'idx_sales_employee_id'
      });
    } catch (err) {
      // Ignore if index already exists
    }

    // Add index for processedBy in SalePayments table
    try {
      await queryInterface.addIndex('SalePayments', ['processedBy'], {
        name: 'idx_sale_payments_processed_by'
      });
    } catch (err) {
      // Ignore if index already exists
    }
    
    // Add index for userId in ActivityLogs table
    try {
      await queryInterface.addIndex('ActivityLogs', ['userId'], {
        name: 'idx_activity_logs_user_id'
      });
    } catch (err) {
      // Ignore if index already exists
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeIndex('Sales', 'idx_sales_employee_id');
    } catch (err) {}
    try {
      await queryInterface.removeIndex('SalePayments', 'idx_sale_payments_processed_by');
    } catch (err) {}
    try {
      await queryInterface.removeIndex('ActivityLogs', 'idx_activity_logs_user_id');
    } catch (err) {}
  }
};