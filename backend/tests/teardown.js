process.env.NODE_ENV = 'test';
require('dotenv').config();
// Enforce dedicated test database name before loading models
process.env.DB_NAME = process.env.TEST_DB_NAME || 'zana_pos_test';
const { sequelize } = require('../src/models');

module.exports = async () => {
  try {
    await sequelize.close();
    console.log('[Test Teardown] Database connection closed.');
  } catch (error) {
    console.warn('[Test Teardown] Connection close skipped:', error.message);
  }
};
