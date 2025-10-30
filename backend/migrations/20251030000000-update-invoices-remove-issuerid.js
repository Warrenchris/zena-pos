'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First add the new employeeId column as nullable
    await queryInterface.addColumn('invoices', 'employeeId', {
      type: Sequelize.UUID,
      allowNull: true, // Initially allow null
      references: {
        model: 'Employees',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    // Fetch an active employee to use as default
    const [defaultEmployee] = await queryInterface.sequelize.query(
      `SELECT id FROM Employees WHERE status = 'active' LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (!defaultEmployee) {
      throw new Error('No active employee found to set as default for existing invoices');
    }

    // Update existing records with the default employee
    await queryInterface.sequelize.query(
      `UPDATE invoices SET employeeId = :employeeId WHERE employeeId IS NULL`,
      {
        replacements: { employeeId: defaultEmployee.id }
      }
    );

    // Now make the column non-nullable
    await queryInterface.changeColumn('invoices', 'employeeId', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'Employees',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    // Remove the issuerId column
    await queryInterface.removeColumn('invoices', 'issuerId');
  },

  down: async (queryInterface, Sequelize) => {
    // First remove employeeId
    await queryInterface.removeColumn('invoices', 'employeeId');

    // Add back issuerId
    await queryInterface.addColumn('invoices', 'issuerId', {
      type: Sequelize.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    // Copy data from userId to issuerId
    await queryInterface.sequelize.query(`
      UPDATE invoices SET issuerId = userId
    `);

    // Remove userId
    await queryInterface.removeColumn('invoices', 'userId');
  }
};