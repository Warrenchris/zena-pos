require('dotenv').config();
const { Sequelize } = require('sequelize');
const { Umzug, SequelizeStorage } = require('umzug');
const sequelize = require('../src/config/database');

async function runMigrations() {
  try {
    // Initialize Umzug instance
    const umzug = new Umzug({
      migrations: { 
        glob: ['migrations/*.js', { cwd: __dirname + '/..' }]
      },
      context: sequelize.getQueryInterface(),
      storage: new SequelizeStorage({ sequelize }),
      logger: console
    });

    // Run pending migrations
    console.log('Running migrations...');
    const migrations = await umzug.up();
    
    if (migrations.length === 0) {
      console.log('No pending migrations.');
    } else {
      console.log('Migrations completed:', migrations.map(m => m.name).join(', '));
    }

    console.log('Database migration successful!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations
runMigrations();