'use strict';

/**
 * Migration: Add autoPrintReceipt to SystemSettings
 *
 * Defaults to false. When true, automatically triggers receipt printing on sale completion.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const desc = await queryInterface.describeTable('SystemSettings');
    if (!desc.autoPrintReceipt) {
      await queryInterface.addColumn('SystemSettings', 'autoPrintReceipt', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('SystemSettings');
    if (desc.autoPrintReceipt) {
      await queryInterface.removeColumn('SystemSettings', 'autoPrintReceipt');
    }
  }
};
