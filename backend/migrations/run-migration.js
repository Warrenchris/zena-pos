'use strict';

const path = require('path');
const Sequelize = require('sequelize');
const config = require('../src/config/database');
const migration = require('./20251013000000-enhance-sales-system');

async function runMigration() {
  try {
    // Create Sequelize instance
    const sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        dialect: 'mysql',
        logging: console.log,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        },
        dialectOptions: {
          connectTimeout: 60000
        },
        retry: {
          max: 3
        }
      }
    );

    // Test the connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Create queryInterface instance
    const queryInterface = sequelize.getQueryInterface();

    // Run the migration
    console.log('Starting migration...');
    await migration.up(queryInterface, Sequelize);
    console.log('Migration completed successfully!');

    // Close the connection
    await sequelize.close();
    console.log('Database connection closed.');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();