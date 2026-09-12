const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS !== undefined ? process.env.DB_PASS : 'root',
    database: process.env.DB_NAME || 'zana_pos',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3307,
    dialect: 'mysql',
    logging: console.log
  },
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS !== undefined ? process.env.DB_PASS : 'root',
    database: process.env.TEST_DB_NAME || 'zana_pos_test',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3307,
    dialect: 'mysql',
    logging: false
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      connectTimeout: 60000,
      ...(process.env.DB_SSL === 'true' ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      } : {})
    }
  }
};