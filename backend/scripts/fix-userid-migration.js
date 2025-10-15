'use strict';

const Sequelize = require('sequelize');
const config = require('../config/config.json');
const migration = require('../migrations/20251014000000-fix-sales-userid-duplicate');

// Use development config by default
const dbConfig = config.development;

async function runMigration() {
  let sequelize;
  try {
    // Create Sequelize instance using config directly
    sequelize = new Sequelize(
      dbConfig.database,
      dbConfig.username,
      dbConfig.password,
      {
        host: dbConfig.host,
        port: dbConfig.port,
        dialect: dbConfig.dialect,
        logging: console.log
      }
    );

    // Test the connection
    await sequelize.authenticate();
    console.log('Connected to database successfully.');

    // Create queryInterface instance
    const queryInterface = sequelize.getQueryInterface();

    console.log('Running migration to fix duplicate UserId column...');
    
    // Run the migration
    await migration.up(queryInterface, Sequelize);
    
    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
}

// Run the migration
runMigration();