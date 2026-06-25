'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Categories');

    // 1. Add active column if not present
    if (!tableInfo.active) {
      await queryInterface.addColumn('Categories', 'active', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }

    // 2. Add unique constraint on name if not present
    // We wrap this in a try-catch as index creation might exist or have unique names
    try {
      const [indexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM `Categories` WHERE Column_name = 'name' AND Non_unique = 0;"
      );
      if (indexes.length === 0) {
        await queryInterface.addIndex('Categories', ['name'], {
          unique: true,
          name: 'Categories_name_unique'
        });
      }
    } catch (err) {
      console.log('Skipping unique index creation on Categories.name:', err.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
