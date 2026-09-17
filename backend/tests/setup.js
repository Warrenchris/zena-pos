process.env.NODE_ENV = 'test';
require('dotenv').config();
// Enforce dedicated test database name before loading models
process.env.DB_NAME = process.env.TEST_DB_NAME || 'zana_pos_test';

module.exports = async () => {
  try {
    const { execSync } = require('child_process');
    if (process.env.RECREATE_TEST_DB === 'true') {
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
    } else {
      try {
        execSync('npx sequelize-cli db:create --env test', { stdio: 'pipe' });
      } catch (e) {}
      execSync('npx sequelize-cli db:migrate --env test', { stdio: 'inherit' });
    }
    console.log('[Test Setup] Database schema migrations completed successfully.');

    // Seed baseline organizations matching Phase 1 migration backfill (Shop 1 -> Org 1, Shop 2 -> Org 2)
    const { Sequelize } = require('sequelize');
    const sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
        dialect: 'mysql',
        logging: false
      }
    );
    await sequelize.query(
      "INSERT INTO `Organizations` (`id`, `name`, `slug`, `status`, `currency`, `createdAt`, `updatedAt`) VALUES " +
      "(1, 'Shop 1 Org', 'shop-1-org', 'active', 'KES', NOW(), NOW()), " +
      "(2, 'Shop 2 Org', 'shop-2-org', 'active', 'KES', NOW(), NOW()) " +
      "ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);"
    );

    const [gfPlans] = await sequelize.query("SELECT id FROM `Plans` WHERE `code` = 'grandfathered' LIMIT 1;");
    const gfPlanId = gfPlans[0]?.id;
    if (gfPlanId) {
      await sequelize.query(
        "INSERT INTO `Subscriptions` (`id`, `organizationId`, `planId`, `status`, `billingCycle`, `currentPeriodStart`, `currentPeriodEnd`, `trialEndsAt`, `cancelAtPeriodEnd`, `createdAt`, `updatedAt`) VALUES " +
        `('00000000-0000-0000-0000-000000000001', 1, ${gfPlanId}, 'active', 'yearly', NOW(), '2099-12-31 23:59:59', NULL, 0, NOW(), NOW()), ` +
        `('00000000-0000-0000-0000-000000000002', 2, ${gfPlanId}, 'active', 'yearly', NOW(), '2099-12-31 23:59:59', NULL, 0, NOW(), NOW()) ` +
        "ON DUPLICATE KEY UPDATE `status`='active';"
      );
    }
    await sequelize.close();
  } catch (e) {
    console.error('[Test Setup] Migration execution failed:', e.message);
    throw e;
  }
};
