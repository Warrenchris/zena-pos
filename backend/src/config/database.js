const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
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

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Database synchronization (sequelize.sync) is disabled.
    // Schema alterations must be done via migrations only.
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

// Export the sequelize instance, and also attach helper for compatibility
module.exports = sequelize;
module.exports.testConnection = testConnection;
