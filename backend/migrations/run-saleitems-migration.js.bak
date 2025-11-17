'use strict';

require('dotenv').config();
const Sequelize = require('sequelize');
const migration = require('./20251027000001-add-shopid-to-saleitems');

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
        logging: console.log
      }
    );

    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    console.log('Starting SaleItems shopId migration...');
    
    // Run the migration
    await migration.up(sequelize.getQueryInterface(), Sequelize);
    console.log('SaleItems shopId migration completed successfully!');

    // Close database connection
    await sequelize.close();
    console.log('Database connection closed.');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();