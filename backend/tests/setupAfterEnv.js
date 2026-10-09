'use strict';

/**
 * Jest setupFilesAfterEnv hook — runs inside each test suite environment.
 *
 * Enforces:
 * 1. Schema Drift Protection: asserts all models registered in src/models/index.js
 *    are categorized into either PRESERVED_BASELINE_MODELS or DELETED_EPHEMERAL_MODELS.
 * 2. Redis DB 1 Isolation: flushes Redis DB 1 beforeAll and afterAll per test file.
 * 3. Seed Baseline Snapshot DB Cleanup: resets all ephemeral tables and restores
 *    the baseline seed (Orgs 1/2, Shops 1/2, Users 1/2, Memberships 1/2, Grandfathered Subscriptions 1/2)
 *    between test files to prevent intra-run shared state pollution.
 */

const models = require('../src/models');
const redisClient = require('../src/config/redis');

// Test-only default encryption secret fallback (never used in production)
process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'e7b4198c61fa2d75a02482310bf8b975e5330e2fbd08544c4897f1f415ef414a';

// Hard Safety Guard: test environment must NEVER run against a non-test database
const testDbName = models.sequelize?.config?.database || process.env.TEST_DB_NAME || process.env.DB_NAME || '';
if (!testDbName.toLowerCase().includes('test')) {
  throw new Error(`SAFETY GUARD: setupAfterEnv cannot execute against database '${testDbName}'. Database name must contain 'test'.`);
}

// 1. Models whose baseline seed data must survive across test files
const PRESERVED_BASELINE_MODELS = new Set([
  'Plan',
  'Permission',
  'RolePermission',
  'Organization',
  'Shop',
  'User',
  'Subscription',
  'OrganizationMembership'
]);

// 2. Models whose rows are entirely ephemeral and must be purged between test files
const DELETED_EPHEMERAL_MODELS = new Set([
  'Category',
  'Product',
  'Customer',
  'Sale',
  'SaleItem',
  'Expense',
  'Store',
  'ActivityLog',
  'Employee',
  'SystemSettings',
  'Invoice',
  'InvoiceItem',
  'PendingPayment',
  'SaleRefund',
  'HeldCart',
  'SalePayment',
  'Coupon',
  'DiscountRule',
  'Purchase',
  'PurchaseOrder',
  'Supplier',
  'StockMovement',
  'PurchaseItem',
  'PurchaseOrderItem',
  'ShopAccess',
  'Inventory',
  'SubscriptionInvoice',
  'StockTransfer',
  'BillingNotificationLog',
  'Brand',
  'Unit'
]);

// --- Coverage Check Assertion (fails loudly on schema drift) ---
const registeredModelNames = Object.keys(models).filter(key => key !== 'sequelize' && typeof models[key] === 'function');
const unhandledModels = registeredModelNames.filter(
  name => !PRESERVED_BASELINE_MODELS.has(name) && !DELETED_EPHEMERAL_MODELS.has(name)
);

if (unhandledModels.length > 0) {
  throw new Error(
    `[Test Infra Coverage Error] The following models registered in src/models/index.js are missing from test cleanup configuration: ${unhandledModels.join(', ')}. ` +
    `Every model must be explicitly categorized in either PRESERVED_BASELINE_MODELS or DELETED_EPHEMERAL_MODELS to prevent test state drift.`
  );
}

// Derive table names dynamically from Sequelize models to prevent drift if tableName options change
const ephemeralTableNames = Array.from(DELETED_EPHEMERAL_MODELS).map(modelName => {
  const model = models[modelName];
  return (model && typeof model.getTableName === 'function') ? model.getTableName() : modelName;
});

async function flushTestRedis() {
  try {
    if (redisClient && (redisClient.status === 'ready' || redisClient.status === 'connect')) {
      await redisClient.flushdb();
    }
  } catch (err) {
    // Suppress Redis flush errors if connection already closed
  }
}

async function resetDatabaseToBaselineSnapshot() {
  const sequelize = models.sequelize;
  if (!sequelize) return;

  const currentDbName = sequelize.config?.database || '';
  if (!currentDbName.toLowerCase().includes('test')) {
    throw new Error(`SAFETY GUARD: resetDatabaseToBaselineSnapshot cannot execute against database '${currentDbName}'. Database name must contain 'test'.`);
  }

  try {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');

    // 1. Purge all ephemeral tables
    for (const tableName of ephemeralTableNames) {
      await sequelize.query(`DELETE FROM \`${tableName}\`;`);
    }

    // 2. Purge test rows from baseline-scoped tables (preserving only IDs 1 and 2, and clean baseline Plans)
    await sequelize.query("DELETE FROM `Plans` WHERE `code` NOT IN ('starter', 'growth', 'pro', 'grandfathered');");
    await sequelize.query("DELETE FROM `Subscriptions` WHERE `id` NOT IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');");
    await sequelize.query("DELETE FROM `OrganizationMemberships` WHERE `id` NOT IN ('1', '2') OR `userId` NOT IN (1, 2);");
    await sequelize.query("DELETE FROM `Users` WHERE `id` NOT IN (1, 2);");
    await sequelize.query("DELETE FROM `Shops` WHERE `id` NOT IN (1, 2);");
    await sequelize.query("DELETE FROM `Organizations` WHERE `id` NOT IN (1, 2);");

    // 3. Ensure baseline snapshot rows are present and valid
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
  } catch (err) {
    // If table cleanup fails during teardown, log warning without silently swallowing
    console.warn('[setupAfterEnv] Teardown database reset warning:', err.message);
  }
}

// Hook into Jest per-suite lifecycle
beforeAll(async () => {
  await flushTestRedis();
});

afterAll(async () => {
  await flushTestRedis();
  await resetDatabaseToBaselineSnapshot();
});

module.exports = {
  PRESERVED_BASELINE_MODELS,
  DELETED_EPHEMERAL_MODELS,
  resetDatabaseToBaselineSnapshot,
  flushTestRedis
};
