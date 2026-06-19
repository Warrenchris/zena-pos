require('dotenv').config();
const { sequelize } = require('../src/models');

module.exports = async () => {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });
  console.log('[Test Setup] Database schema synced.');
  await sequelize.close();
};
