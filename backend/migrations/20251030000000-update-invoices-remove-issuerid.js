'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // This migration modifies invoices table structure - skip entirely if table doesn't exist
    // or if employeeId already present (handled by later migrations)
    try {
      const tableInfo = await queryInterface.describeTable('invoices');

      if (!tableInfo.employeeId) {
        // Add employeeId as nullable first
        await queryInterface.addColumn('invoices', 'employeeId', {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'Employees', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        });

        // Fetch an active employee to use as default (skip if none)
        const [defaultEmployee] = await queryInterface.sequelize.query(
          `SELECT id FROM Employees WHERE status = 'active' LIMIT 1`,
          { type: queryInterface.sequelize.QueryTypes.SELECT }
        );

        if (defaultEmployee) {
          await queryInterface.sequelize.query(
            `UPDATE invoices SET employeeId = :employeeId WHERE employeeId IS NULL`,
            { replacements: { employeeId: defaultEmployee.id } }
          );
        }
      }

      // Remove issuerId if it exists
      if (tableInfo.issuerId) {
        await queryInterface.removeColumn('invoices', 'issuerId');
      }
    } catch (err) {
      console.log('20251030000000-update-invoices-remove-issuerid skipped:', err.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      const tableInfo = await queryInterface.describeTable('invoices');
      if (tableInfo.employeeId) {
        await queryInterface.removeColumn('invoices', 'employeeId');
      }
      if (!tableInfo.issuerId) {
        await queryInterface.addColumn('invoices', 'issuerId', {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        });
      }
    } catch (err) {
      console.log('Down migration 20251030000000-update-invoices-remove-issuerid skipped:', err.message);
    }
  }
};