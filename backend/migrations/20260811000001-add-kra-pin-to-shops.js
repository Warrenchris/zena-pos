'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('Shops');

      if (!tableDescription.kraPin) {
        await queryInterface.addColumn('Shops', 'kraPin', {
          type: Sequelize.STRING,
          allowNull: true
        });
        console.log('Added column kraPin to Shops');
      } else {
        console.log('Column kraPin already exists in Shops, skipping');
      }

      if (!tableDescription.registrationNumber) {
        await queryInterface.addColumn('Shops', 'registrationNumber', {
          type: Sequelize.STRING,
          allowNull: true
        });
        console.log('Added column registrationNumber to Shops');
      } else {
        console.log('Column registrationNumber already exists in Shops, skipping');
      }
    } catch (err) {
      console.error('Failed executing migration 20260811000001-add-kra-pin-to-shops:', err);
      throw err;
    }
  },

  async down(queryInterface) {
    try {
      const tableDescription = await queryInterface.describeTable('Shops');

      if (tableDescription.kraPin) {
        await queryInterface.removeColumn('Shops', 'kraPin');
        console.log('Removed column kraPin from Shops');
      }

      if (tableDescription.registrationNumber) {
        await queryInterface.removeColumn('Shops', 'registrationNumber');
        console.log('Removed column registrationNumber from Shops');
      }
    } catch (err) {
      console.error('Failed reverting migration 20260811000001-add-kra-pin-to-shops:', err);
    }
  }
};
