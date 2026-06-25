require('dotenv').config();
const { sequelize } = require('../src/models');

module.exports = async () => {
  await sequelize.authenticate();

  try {
    const { execSync } = require('child_process');
    console.log(`[Test Setup] Running migrations on database: ${sequelize.config.database}...`);
    execSync('npx sequelize-cli db:migrate', {
      env: {
        ...process.env,
        DB_NAME: sequelize.config.database,
        DB_HOST: sequelize.config.host,
        DB_PORT: sequelize.config.port,
        NODE_ENV: 'development' // Force sequelize-cli to use the development block mapping to DB_NAME
      },
      stdio: 'inherit'
    });
  } catch (e) {
    console.error('[Test Setup] Migration execution failed:', e.message);
    throw e;
  }

  console.log('[Test Setup] Database schema migrations completed successfully.');
  await sequelize.close();
};
