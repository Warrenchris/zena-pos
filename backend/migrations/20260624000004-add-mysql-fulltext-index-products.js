'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'mysql' || dialect === 'mariadb') {
      try {
        await queryInterface.sequelize.query('ALTER TABLE Products ADD FULLTEXT INDEX ft_products_name (name);');
      } catch (err) {
        if (!err.message.includes('Duplicate key name') && !err.message.includes('already exists')) {
          throw err;
        }
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    const dialect = queryInterface.sequelize.getDialect();
    if (dialect === 'mysql' || dialect === 'mariadb') {
      try {
        await queryInterface.sequelize.query('ALTER TABLE Products DROP INDEX ft_products_name;');
      } catch (err) {
        // Ignore if it does not exist
      }
    }
  }
};
