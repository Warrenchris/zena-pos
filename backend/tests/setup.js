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
        execSync('node ./node_modules/sequelize-cli/lib/sequelize db:drop --env test', { stdio: 'inherit' });
      } catch (e) {
        console.log('[Test Setup] Database drop skipped:', e.message);
      }
      console.log('[Test Setup] Creating test database...');
      execSync('node ./node_modules/sequelize-cli/lib/sequelize db:create --env test', { stdio: 'inherit' });
      console.log('[Test Setup] Running migrations on test database...');
      execSync('node ./node_modules/sequelize-cli/lib/sequelize db:migrate --env test', { stdio: 'inherit' });
    } else {
      try {
        execSync('node ./node_modules/sequelize-cli/lib/sequelize db:create --env test', { stdio: 'pipe' });
      } catch (e) {}
      try {
        execSync('node ./node_modules/sequelize-cli/lib/sequelize db:migrate --env test', { stdio: 'inherit' });
      } catch (migErr) {
        console.warn('[Test Setup] db:migrate warning (schema may already be migrated):', migErr.message);
      }
    }
    console.log('[Test Setup] Database schema migrations completed successfully.');

process.env.REDIS_DB = process.env.TEST_REDIS_DB || '1';

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
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
    await sequelize.query(
      "INSERT INTO `Organizations` (`id`, `name`, `slug`, `status`, `currency`, `createdAt`, `updatedAt`) VALUES " +
      "(1, 'Shop 1 Org', 'shop-1-org', 'active', 'KES', NOW(), NOW()), " +
      "(2, 'Shop 2 Org', 'shop-2-org', 'active', 'KES', NOW(), NOW()) " +
      "ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);"
    );
    await sequelize.query(
      "INSERT INTO `Shops` (`id`, `name`, `organizationId`, `active`, `createdAt`, `updatedAt`) VALUES " +
      "(1, 'Shop 1', 1, 1, NOW(), NOW()), " +
      "(2, 'Shop 2', 2, 1, NOW(), NOW()) " +
      "ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);"
    );
    await sequelize.query(
      "INSERT INTO `Users` (`id`, `name`, `email`, `password`, `role`, `shopId`, `active`, `createdAt`, `updatedAt`) VALUES " +
      "(1, 'Shop 1 Admin', 'shop1-admin@test.local', '$2a$10$dummyHashForTestingPassw12345678901234567890', 'admin', 1, 1, NOW(), NOW()), " +
      "(2, 'Shop 2 Admin', 'shop2-admin@test.local', '$2a$10$dummyHashForTestingPassw12345678901234567890', 'admin', 2, 1, NOW(), NOW()) " +
      "ON DUPLICATE KEY UPDATE `email`=VALUES(`email`);"
    );
    await sequelize.query(
      "INSERT INTO `OrganizationMemberships` (`id`, `organizationId`, `userId`, `orgRole`, `status`, `createdAt`, `updatedAt`) VALUES " +
      "(1, 1, 1, 'owner', 'active', NOW(), NOW()), " +
      "(2, 2, 2, 'owner', 'active', NOW(), NOW()) " +
      "ON DUPLICATE KEY UPDATE `orgRole`=VALUES(`orgRole`);"
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
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');
    await sequelize.close();

    // Clean Redis test database to prevent cross-run state pollution
    try {
      const Redis = require('ioredis');
      const redis = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: Number(process.env.REDIS_DB || 1),
        enableOfflineQueue: false,
        connectTimeout: 2000
      });
      await redis.flushdb();
      await redis.quit();
    } catch (e) {
      // Redis optional during setup
    }
  } catch (e) {
    console.error('[Test Setup] Migration execution failed:', e.message);
    throw e;
  }
};
