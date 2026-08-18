process.env.NODE_ENV = 'test';
require('dotenv').config();
// Enforce dedicated test database name before loading models
process.env.DB_NAME = process.env.TEST_DB_NAME || 'zana_pos_test';
const { sequelize } = require('../src/models');
const redisClient = require('../src/config/redis');

module.exports = async () => {
  try {
    await sequelize.close();
    console.log('[Test Teardown] Database connection closed.');
  } catch (error) {
    console.warn('[Test Teardown] Connection close skipped:', error.message);
  }
  try {
    redisClient.disconnect();
    console.log('[Test Teardown] Redis connection closed.');
  } catch (error) {
    // Ignore if already disconnected
  }
};
