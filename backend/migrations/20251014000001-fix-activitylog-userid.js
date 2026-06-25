'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.changeColumn('ActivityLogs', 'userId', {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'Users', key: 'id' }
      });
    } catch (err) {
      console.log('changeColumn ActivityLogs.userId skipped:', err.message);
    }
  },

  async down(queryInterface, Sequelize) {
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