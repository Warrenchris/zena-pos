'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('SystemSettings');

      if (!tableDescription.lowStockThreshold) {
        await queryInterface.addColumn('SystemSettings', 'lowStockThreshold', {
          type: Sequelize.INTEGER,
          defaultValue: 10,
          allowNull: false
        });
        console.log('Added column lowStockThreshold to SystemSettings');
      }

      if (!tableDescription.skuPrefix) {
        await queryInterface.addColumn('SystemSettings', 'skuPrefix', {
          type: Sequelize.STRING,
          defaultValue: 'SKU',
          allowNull: false
        });
        console.log('Added column skuPrefix to SystemSettings');
      }

      if (!tableDescription.barcodeFormat) {
        await queryInterface.addColumn('SystemSettings', 'barcodeFormat', {
          type: Sequelize.STRING,
          defaultValue: 'EAN13',
          allowNull: false
        });
        console.log('Added column barcodeFormat to SystemSettings');
      }

      if (!tableDescription.aiDigestFrequency) {
        await queryInterface.addColumn('SystemSettings', 'aiDigestFrequency', {
          type: Sequelize.ENUM('none', 'daily', 'weekly'),
          defaultValue: 'weekly',
          allowNull: false
        });
        console.log('Added column aiDigestFrequency to SystemSettings');
      }
    } catch (err) {
      console.error('Failed executing migration 20260811000002-add-inventory-and-ai-settings:', err);
      throw err;
    }
  },

  async down(queryInterface) {
    try {
      const tableDescription = await queryInterface.describeTable('SystemSettings');

      if (tableDescription.lowStockThreshold) {
        await queryInterface.removeColumn('SystemSettings', 'lowStockThreshold');
      }
      if (tableDescription.skuPrefix) {
        await queryInterface.removeColumn('SystemSettings', 'skuPrefix');
      }
      if (tableDescription.barcodeFormat) {
        await queryInterface.removeColumn('SystemSettings', 'barcodeFormat');
      }
      if (tableDescription.aiDigestFrequency) {
        await queryInterface.removeColumn('SystemSettings', 'aiDigestFrequency');
      }
    } catch (err) {
      console.error('Failed reverting migration 20260811000002-add-inventory-and-ai-settings:', err);
    }
  }
};
