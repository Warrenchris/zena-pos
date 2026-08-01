process.env.NODE_ENV = 'test';
require('dotenv').config();
// Enforce dedicated test database name before loading models
process.env.DB_NAME = process.env.TEST_DB_NAME || 'zana_pos_test';

module.exports = async () => {
  try {
    const { execSync } = require('child_process');
    console.log('[Test Setup] Dropping test database if exists...');
    try {
      execSync('npx sequelize-cli db:drop --env test', { stdio: 'inherit' });
    } catch (e) {
      console.log('[Test Setup] Database drop skipped:', e.message);
    }
    console.log('[Test Setup] Creating test database...');
    execSync('npx sequelize-cli db:create --env test', { stdio: 'inherit' });
    console.log('[Test Setup] Running migrations on test database...');
    execSync('npx sequelize-cli db:migrate --env test', { stdio: 'inherit' });
    console.log('[Test Setup] Database schema migrations completed successfully.');
  } catch (e) {
    console.error('[Test Setup] Migration execution failed:', e.message);
    throw e;
  }
};
