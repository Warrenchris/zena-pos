'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await queryInterface.sequelize.query('CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON "Products" USING gin (name gin_trgm_ops);');
  },

  down: async (queryInterface, Sequelize) => {
    if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS products_name_trgm_idx;');
  }
};
