'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.createTable('Brands', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        name: { type: Sequelize.STRING, allowNull: false, unique: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        website: { type: Sequelize.STRING, allowNull: true },
        logo: { type: Sequelize.STRING, allowNull: true },
        shopId: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        createdAt: { allowNull: false, type: Sequelize.DATE },
        updatedAt: { allowNull: false, type: Sequelize.DATE }
      });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table Brands already exists, skipping');
    }
    try { await queryInterface.addIndex('Brands', ['shopId']); } catch (err) { /* already exists */ }
    try { await queryInterface.addIndex('Brands', ['name']); } catch (err) { /* already exists */ }
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Brands');
  }
};