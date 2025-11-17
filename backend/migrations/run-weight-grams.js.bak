'use strict';

require('dotenv').config();
const Sequelize = require('sequelize');
const migration = require('./20251105000000-add-weight-grams-to-products');

async function runMigration() {
  try {
    const sequelize = new Sequelize(
      process.env.DB_NAME || 'zana',
      process.env.DB_USER || 'root',
      process.env.DB_PASS || '',
      {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        dialect: 'mysql',
        logging: console.log,
      }
    );

    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    const queryInterface = sequelize.getQueryInterface();

    console.log('Running weightGrams migration...');
    await migration.up(queryInterface, Sequelize);
    console.log('weightGrams migration completed successfully!');

    await sequelize.close();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();


