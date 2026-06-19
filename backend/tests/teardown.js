require('dotenv').config();
const { sequelize } = require('../src/models');

module.exports = async () => {
  try {
    await sequelize.close();
    console.log('[Test Teardown] Database connection closed.');
  } catch (error) {
    console.warn('[Test Teardown] Connection close skipped:', error.message);
  }
};
