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

    if (process.env.NODE_ENV === 'development') {
      // First try to sync without altering
      try {
        await sequelize.sync();
        console.log('Database synchronized successfully.');
      } catch (syncError) {
        console.log('Initial sync failed, attempting to sync with force...');
        // If sync fails, try to force sync
        await sequelize.sync({ force: true });
        console.log('Database force synchronized successfully.');
      }
    }
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    throw error;
  }
}

// Export the sequelize instance, and also attach helper for compatibility
module.exports = sequelize;
module.exports.testConnection = testConnection;
