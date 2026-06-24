'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Allow userId to be NULL
    await queryInterface.changeColumn('ActivityLogs', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      }
    });

    // 2. Add performedByEmployee UUID column
    await queryInterface.addColumn('ActivityLogs', 'performedByEmployee', {
      type: Sequelize.STRING(36),
      allowNull: true,
      references: {
        model: 'Employees',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // 3. Add details text column
    await queryInterface.addColumn('ActivityLogs', 'details', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    // 1. Remove details column
    await queryInterface.removeColumn('ActivityLogs', 'details');

    // 2. Remove performedByEmployee column
    await queryInterface.removeColumn('ActivityLogs', 'performedByEmployee');

    // 3. Make userId NOT NULL (revert change)
    await queryInterface.changeColumn('ActivityLogs', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    });
  }
};
