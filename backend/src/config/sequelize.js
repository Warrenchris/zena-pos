const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const parsePoolInt = (val, fallback) => {
  if (val === undefined || val === null || String(val).trim() === '') return fallback;
  const parsed = Number(val);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

module.exports = {
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS !== undefined ? process.env.DB_PASS : 'root',
    database: process.env.DB_NAME || 'zana_pos',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3307,
    dialect: 'mysql',
    logging: process.env.DEBUG_SQL === 'true' ? console.log : false,
    pool: {
      max: parsePoolInt(process.env.DB_POOL_MAX, 15),
      min: parsePoolInt(process.env.DB_POOL_MIN, 0),
      acquire: parsePoolInt(process.env.DB_POOL_ACQUIRE_MS, 60000),
      idle: parsePoolInt(process.env.DB_POOL_IDLE_MS, 10000)
    }
  },
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASS !== undefined ? process.env.DB_PASS : 'root',
    database: process.env.TEST_DB_NAME || 'zana_pos_test',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3307,
    dialect: 'mysql',
    logging: process.env.DEBUG_SQL === 'true' ? console.log : false,
    pool: {
      max: parsePoolInt(process.env.DB_POOL_MAX, 5),
      min: parsePoolInt(process.env.DB_POOL_MIN, 0),
      acquire: parsePoolInt(process.env.DB_POOL_ACQUIRE_MS, 60000),
      idle: parsePoolInt(process.env.DB_POOL_IDLE_MS, 10000)
    }
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: process.env.DEBUG_SQL === 'true' ? console.log : false,
    pool: {
      max: parsePoolInt(process.env.DB_POOL_MAX, 10),
      min: parsePoolInt(process.env.DB_POOL_MIN, 2),
      acquire: parsePoolInt(process.env.DB_POOL_ACQUIRE_MS, 30000),
      idle: parsePoolInt(process.env.DB_POOL_IDLE_MS, 10000)
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