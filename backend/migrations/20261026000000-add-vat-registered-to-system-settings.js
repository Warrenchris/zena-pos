'use strict';

/**
 * Migration: Add vatRegistered to SystemSettings
 *
 * SystemSettings table:
 * - vatRegistered: BOOLEAN NOT NULL DEFAULT 0
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    const [settingsCols] = await queryInterface.sequelize.query("SHOW COLUMNS FROM `SystemSettings`;").catch(() => [[]]);
    const existingSettingsColNames = new Set(settingsCols.map(c => c.Field));

    if (!existingSettingsColNames.has('vatRegistered')) {
      await queryInterface.addColumn('SystemSettings', 'vatRegistered', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('SystemSettings', 'vatRegistered').catch(() => {});
  }
};
