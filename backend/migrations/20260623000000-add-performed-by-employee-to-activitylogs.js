'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Make userId nullable on ActivityLogs
    try {
      await queryInterface.changeColumn('ActivityLogs', 'userId', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'Users', key: 'id' }
      });
    } catch (err) {
      console.log('changeColumn ActivityLogs.userId skipped:', err.message);
    }

    const tableInfo = await queryInterface.describeTable('ActivityLogs');

    // 2. Add performedByEmployee VARCHAR(36) column — no FK to avoid type mismatch with CHAR(36) BINARY
    if (!tableInfo.performedByEmployee) {
      await queryInterface.addColumn('ActivityLogs', 'performedByEmployee', {
        type: Sequelize.STRING(36),
        allowNull: true
      });
    }

    // 3. Add details TEXT column
    if (!tableInfo.details) {
      await queryInterface.addColumn('ActivityLogs', 'details', {
        type: Sequelize.TEXT, allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('ActivityLogs');
    if (tableInfo.details) {
      await queryInterface.removeColumn('ActivityLogs', 'details');
    }
    if (tableInfo.performedByEmployee) {
      await queryInterface.removeColumn('ActivityLogs', 'performedByEmployee');
    }
    try {
      await queryInterface.changeColumn('ActivityLogs', 'userId', {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'Users', key: 'id' }
      });
    } catch (err) {
      console.log('changeColumn ActivityLogs.userId down skipped:', err.message);
    }
  }
};
