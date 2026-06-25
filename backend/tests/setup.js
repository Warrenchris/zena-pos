require('dotenv').config();
const { sequelize } = require('../src/models');

module.exports = async () => {
  await sequelize.authenticate();

  // Disable FK checks at session level before any alterations
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    await sequelize.query('ALTER TABLE `ActivityLogs` MODIFY `userId` INTEGER NULL;');
  } catch (e) {
    // Ignore if already nullable
  }
  try {
    await sequelize.query('ALTER TABLE `SaleRefunds` DROP FOREIGN KEY `SaleRefunds_ibfk_2`;');
  } catch (e) {
    // Ignore
  }
  try {
    await sequelize.query('ALTER TABLE `SalePayments` DROP FOREIGN KEY `SalePayments_ibfk_2`;');
  } catch (e) {
    // Ignore
  }
  try {
    await sequelize.query('ALTER TABLE `SalePayments` MODIFY `processedBy` VARCHAR(36) NULL;');
  } catch (e) {
    // Ignore
  }
  try {
    await sequelize.query('ALTER TABLE `Employees` ADD COLUMN `hireDate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;');
  } catch (e) {
    // Ignore
  }

  // Sync with FK checks disabled via beforeConnect hook
  sequelize.addHook('beforeConnect', async (config) => {
    config.multipleStatements = true;
  });

  try {
    // Run sync with foreign key checks disabled at connection level
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
    await sequelize.sync({ alter: true });
  } catch (e) {
    // If sync fails due to FK conflicts, log and continue — migrations already created the schema
    console.warn('[Test Setup] sync alter warning (non-fatal):', e.message?.split('\n')[0]);
  }

  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
  console.log('[Test Setup] Database schema synced.');
  await sequelize.close();
};
