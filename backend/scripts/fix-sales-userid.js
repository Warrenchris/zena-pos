'use strict';

const path = require('path');
const Sequelize = require('sequelize');
const config = require('../src/config/database');
const migration = require('./20251014000000-fix-sales-userid-duplicate');

async function runMigration() {
  try {
    // Create Sequelize instance
    const sequelize = new Sequelize(
      process.env.DB_NAME || config.database,
      process.env.DB_USER || config.username,
      process.env.DB_PASS || config.password,
      {
        host: process.env.DB_HOST || config.host || '127.0.0.1',
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

    // Create queryInterface instance
    const queryInterface = sequelize.getQueryInterface();

    console.log('Running migration to fix duplicate UserId column...');
    
    // Run the migration
    await migration.up(queryInterface, Sequelize);
    
    console.log('Migration completed successfully!');
    
    // Close the connection
    await sequelize.close();
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();