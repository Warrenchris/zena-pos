'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('ActivityLogs');

    // 1. Add entity if not present
    if (!tableInfo.entity) {
      await queryInterface.addColumn('ActivityLogs', 'entity', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    // 2. Add entityId if not present
    if (!tableInfo.entityId) {
      await queryInterface.addColumn('ActivityLogs', 'entityId', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    // 3. Add metadata if not present
    if (!tableInfo.metadata) {
      await queryInterface.addColumn('ActivityLogs', 'metadata', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
