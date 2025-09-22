'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add parentCategoryId to Categories table
    await queryInterface.addColumn('Categories', 'parentCategoryId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Categories',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for parentCategoryId
    await queryInterface.addIndex('Categories', ['parentCategoryId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('Categories', ['parentCategoryId']);
    await queryInterface.removeColumn('Categories', 'parentCategoryId');
  }
};