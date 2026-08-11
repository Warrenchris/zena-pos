const { Sequelize } = require('sequelize');
const runMigration = require('../migrations/20260811000000-add-pos-and-payment-settings');
const sequelize = require('../src/config/database');

async function run() {
  try {
    console.log('🔄 Running SystemSettings POS and Payment Settings migration...');
    await runMigration.up(sequelize.getQueryInterface(), Sequelize);
    console.log('✅ SystemSettings table updated successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
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
