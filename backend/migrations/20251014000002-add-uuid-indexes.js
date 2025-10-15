'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add index for employeeId in Sales table
    await queryInterface.addIndex('Sales', ['employeeId'], {
      name: 'idx_sales_employee_id'
    });

    // Add index for processedBy in SalePayments table
    await queryInterface.addIndex('SalePayments', ['processedBy'], {
      name: 'idx_sale_payments_processed_by'
    });
    
    // Add index for userId in ActivityLogs table
    await queryInterface.addIndex('ActivityLogs', ['userId'], {
      name: 'idx_activity_logs_user_id'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('Sales', 'idx_sales_employee_id');
    await queryInterface.removeIndex('SalePayments', 'idx_sale_payments_processed_by');
    await queryInterface.removeIndex('ActivityLogs', 'idx_activity_logs_user_id');
  }
};