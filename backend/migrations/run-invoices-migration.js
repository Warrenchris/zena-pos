'use strict';

require('dotenv').config();
const Sequelize = require('sequelize');
const migration = require('./20251028000000-create-invoices-table');

async function runMigration() {
  try {
    const sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        dialect: 'mysql',
        logging: console.log,
        pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
        dialectOptions: { connectTimeout: 60000 },
        retry: { max: 3 }
      }
    );

    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    const queryInterface = sequelize.getQueryInterface();

    console.log('Starting invoices migration...');
    await migration.up(queryInterface, Sequelize);
    console.log('Invoices migration completed successfully!');

    await sequelize.close();
    console.log('Database connection closed.');
  } catch (error) {
    console.error('Invoices migration failed:', error);
    process.exit(1);
  }
}

runMigration();


