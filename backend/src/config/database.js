const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
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

async function testConnection(maxRetries = 1, retryDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sequelize.authenticate();
      console.log('Database connection established successfully.');
      return;
    } catch (error) {
      if (attempt >= maxRetries) {
        console.error('Unable to connect to the database:', error);
        throw error;
      }
      console.warn(`[database] Connection attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${retryDelay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

// Query-level safeguard hook to assert both bounds of Op.between dates are valid
const validateWhereDates = (where) => {
  if (!where || typeof where !== 'object') return;
  const { Op } = require('sequelize');
  const keys = [
    ...Object.keys(where),
    ...Object.getOwnPropertySymbols(where)
  ];

  for (const key of keys) {
    const value = where[key];
    if (key === Op.between && Array.isArray(value)) {
      const { assertValidBounds } = require('../utils/dateUtils');
      assertValidBounds(value);
    } else if (value && typeof value === 'object') {
      validateWhereDates(value);
    }
  }
};

sequelize.addHook('beforeFind', (options) => {
  if (options && options.where) {
    validateWhereDates(options.where);
  }
});
sequelize.addHook('beforeCount', (options) => {
  if (options && options.where) {
    validateWhereDates(options.where);
  }
});
sequelize.addHook('beforeBulkDestroy', (options) => {
  if (options && options.where) {
    validateWhereDates(options.where);
  }
});
sequelize.addHook('beforeBulkUpdate', (options) => {
  if (options && options.where) {
    validateWhereDates(options.where);
  }
});

// Export the sequelize instance, and also attach helper for compatibility
module.exports = sequelize;
module.exports.testConnection = testConnection;
