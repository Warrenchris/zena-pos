const { Sequelize } = require('sequelize');
const runMigration = require('../migrations/20260623000000-add-performed-by-employee-to-activitylogs');
const sequelize = require('../src/config/database');

async function run() {
  try {
    console.log('🔄 Running ActivityLogs migration on the main database...');
    // We get query interface from the active connection instance
    await runMigration.up(sequelize.getQueryInterface(), Sequelize);
    console.log('✅ ActivityLogs table updated successfully in main database!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    // If table column already exists, print warning but exit clean
    if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
      console.log('⚠️ Warning: Columns might already exist. Safe to proceed.');
    } else {
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

run();
