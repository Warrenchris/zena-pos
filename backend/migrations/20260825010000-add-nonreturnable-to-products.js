'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('Products');

      if (!tableDescription.nonReturnable) {
        await queryInterface.addColumn('Products', 'nonReturnable', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        });
        console.log('Added column nonReturnable to Products');
      } else {
        console.log('Column nonReturnable already exists in Products, skipping');
      }
    } catch (err) {
      console.error('Failed executing migration 20260825010000-add-nonreturnable-to-products:', err);
      throw err;
    }
  },

  async down(queryInterface) {
    try {
      const tableDescription = await queryInterface.describeTable('Products');

      if (tableDescription.nonReturnable) {
        await queryInterface.removeColumn('Products', 'nonReturnable');
        console.log('Removed column nonReturnable from Products');
      }
    } catch (err) {
      console.error('Failed reverting migration 20260825010000-add-nonreturnable-to-products:', err);
    }
  }
};
