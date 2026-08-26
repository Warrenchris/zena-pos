process.env.NODE_ENV = 'test';
require('dotenv').config();
// Enforce dedicated test database name before loading models
process.env.DB_NAME = process.env.TEST_DB_NAME || 'zana_pos_test';
const { sequelize } = require('../src/models');
const redisClient = require('../src/config/redis');

module.exports = async () => {
  // Cancel the aiProxy background health-probe timer before Jest tears down
  // the module registry. Without this, the setTimeout fires after teardown
  // and triggers an axios request into an already-destroyed environment,
  // producing "ReferenceError: import after Jest environment torn down".
  try {
    const { stopProbe } = require('../src/routes/aiProxy');
    stopProbe();
  } catch (_) {
    // aiProxy may not have been loaded in all test suites — safe to ignore.
  }

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

