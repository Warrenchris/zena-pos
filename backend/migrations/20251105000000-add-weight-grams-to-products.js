'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('Products', 'weightGrams', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    } catch (err) {
      console.error('Failed adding weightGrams column:', err);
      throw err;
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('Products', 'weightGrams');
    } catch (err) {
      console.error('Failed removing weightGrams column:', err);
      throw err;
    }
  }
};


