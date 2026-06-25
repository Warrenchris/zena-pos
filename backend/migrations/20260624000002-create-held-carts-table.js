'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.createTable('HeldCarts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        shopId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        cashierId: { type: Sequelize.STRING(36), allowNull: false },
        label: { type: Sequelize.STRING(80), allowNull: true },
        cartSnapshot: { type: Sequelize.JSON, allowNull: false },
        heldAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        expiresAt: { type: Sequelize.DATE, allowNull: false },
        status: { type: Sequelize.ENUM('held', 'recalled'), allowNull: false, defaultValue: 'held' },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { engine: 'InnoDB' });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table HeldCarts already exists, skipping');
    }
    try { await queryInterface.addIndex('HeldCarts', ['shopId']); } catch (e) {}
    try { await queryInterface.addIndex('HeldCarts', ['cashierId']); } catch (e) {}
    try { await queryInterface.addIndex('HeldCarts', ['status']); } catch (e) {}
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('HeldCarts');
  }
};
