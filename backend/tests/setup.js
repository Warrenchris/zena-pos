require('dotenv').config();
const { sequelize } = require('../src/models');

module.exports = async () => {
  await sequelize.authenticate();
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    await sequelize.query('ALTER TABLE `ActivityLogs` MODIFY `userId` INTEGER NULL;');
  } catch (e) {
    // Ignore warning
  }
  await sequelize.sync({ alter: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Test Setup] Database schema synced.');
  await sequelize.close();
};
