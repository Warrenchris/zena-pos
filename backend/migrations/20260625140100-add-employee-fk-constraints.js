'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    // Add physical FK on ActivityLogs.performedByEmployee referencing Employees.id
    await queryInterface.addConstraint('ActivityLogs', {
      fields: ['performedByEmployee'],
      type: 'foreign key',
      name: 'fk_activitylogs_performedByEmployee',
      references: {
        table: 'Employees',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    // Add physical FK on SalePayments.processedBy referencing Employees.id
    await queryInterface.addConstraint('SalePayments', {
      fields: ['processedBy'],
      type: 'foreign key',
      name: 'fk_salepayments_processedBy',
      references: {
        table: 'Employees',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    // Drop the constraints by name
    await queryInterface.removeConstraint('ActivityLogs', 'fk_activitylogs_performedByEmployee');
    await queryInterface.removeConstraint('SalePayments', 'fk_salepayments_processedBy');

    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};
