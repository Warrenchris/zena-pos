const { sequelize } = require('./src/models');

async function run() {
  try {
    await sequelize.authenticate();
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
    try {
      await sequelize.query('ALTER TABLE `ActivityLogs` MODIFY `userId` INTEGER NULL;');
    } catch (e) {
      console.warn('Modify column warning:', e.message);
    }
    await sequelize.sync({ alter: true });
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('Sync ok');
    process.exit(0);
  } catch (err) {
    console.error('Sync failed:');
    console.error(err);
    process.exit(1);
  }
}

run();
