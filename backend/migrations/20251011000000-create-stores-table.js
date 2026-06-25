'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.createTable('stores', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        address: { type: Sequelize.STRING, allowNull: false },
        phone: { type: Sequelize.STRING },
        email: { type: Sequelize.STRING },
        isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
        createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table stores already exists, skipping');
    }
    try { await queryInterface.addIndex('stores', ['name']); } catch (e) {}
    try { await queryInterface.addIndex('stores', ['isActive']); } catch (e) {}
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('stores');
  }
};