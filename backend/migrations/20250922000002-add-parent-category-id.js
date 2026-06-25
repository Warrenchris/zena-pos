'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Categories');
    if (!tableInfo.parentCategoryId) {
      await queryInterface.addColumn('Categories', 'parentCategoryId', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'Categories', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL'
      });
    }
    try {
      await queryInterface.addIndex('Categories', ['parentCategoryId']);
    } catch (err) { console.log('Index on parentCategoryId already exists, skipping'); }
  },
  down: async (queryInterface, Sequelize) => {
    try { await queryInterface.removeIndex('Categories', ['parentCategoryId']); } catch (err) {}
    const tableInfo = await queryInterface.describeTable('Categories');
    if (tableInfo.parentCategoryId) {
      await queryInterface.removeColumn('Categories', 'parentCategoryId');
    }
  }
};