const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize({
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
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
});

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Ensure schema is in sync locally so new columns (e.g., expirationDate) are created
    // Use alter to be non-destructive. Set DB_SYNC_FORCE=true to force if needed.
    const shouldAlter = process.env.DB_SYNC_FORCE !== 'true';
    if (shouldAlter) {
      await sequelize.sync({ alter: true });
      console.log('Database synchronized with alter successfully.');
    } else {
      await sequelize.sync({ force: true });
      console.log('Database force synchronized successfully.');
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

// Export the sequelize instance, and also attach helper for compatibility
module.exports = sequelize;
module.exports.testConnection = testConnection;
