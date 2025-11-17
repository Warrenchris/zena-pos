'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('Products');
      if (!tableDescription.weightGrams) {
        await queryInterface.addColumn('Products', 'weightGrams', {
          type: Sequelize.INTEGER,
          allowNull: true,
        });
      } else {
        console.log('Column weightGrams already exists, skipping');
      }
    } catch (err) {
      if (err.message && err.message.includes('Duplicate column')) {
        console.log('Column weightGrams already exists, skipping');
      } else if (err.sqlMessage && err.sqlMessage.includes('Duplicate column')) {
        console.log('Column weightGrams already exists, skipping');
      } else {
        console.error('Failed adding weightGrams column:', err);
        throw err;
      }
    }
  },

  async down(queryInterface) {
    try {
      const tableDescription = await queryInterface.describeTable('Products');
      if (tableDescription.weightGrams) {
        await queryInterface.removeColumn('Products', 'weightGrams');
      }
    } catch (err) {
      console.error('Failed removing weightGrams column:', err);
    }
  }
};


