'use strict';

const models = require('../src/models');
const redisClient = require('../src/config/redis');
const {
  PRESERVED_BASELINE_MODELS,
  DELETED_EPHEMERAL_MODELS,
  resetDatabaseToBaselineSnapshot
} = require('./setupAfterEnv');

describe('Phase 8: Test Infrastructure Hardening & Schema Drift Coverage', () => {
  test('1. Every model registered in src/models/index.js is covered by cleanup sets (no schema drift)', () => {
    const registeredModelNames = Object.keys(models).filter(
      key => key !== 'sequelize' && typeof models[key] === 'function'
    );

    expect(registeredModelNames.length).toBeGreaterThanOrEqual(37);

    const unhandled = registeredModelNames.filter(
      name => !PRESERVED_BASELINE_MODELS.has(name) && !DELETED_EPHEMERAL_MODELS.has(name)
    );

    expect(unhandled).toEqual([]);
  });

  test('2. PRESERVED_BASELINE_MODELS and DELETED_EPHEMERAL_MODELS are strictly disjoint', () => {
    const overlap = Array.from(PRESERVED_BASELINE_MODELS).filter(name =>
      DELETED_EPHEMERAL_MODELS.has(name)
    );
    expect(overlap).toEqual([]);
  });

  test('3. Redis client is configured with dedicated test database index 1', () => {
    const options = redisClient.options || {};
    expect(options.db).toBe(1);
  });

  test('4. Seed Baseline Snapshot preserves baseline entities with zero dangling foreign keys', async () => {
    // Run resetDatabaseToBaselineSnapshot
    await resetDatabaseToBaselineSnapshot();

    // Verify baseline Orgs 1 & 2
    const orgs = await models.Organization.findAll({ order: [['id', 'ASC']] });
    expect(orgs.length).toBe(2);
    expect(orgs.map(o => o.id)).toEqual([1, 2]);

    // Verify baseline Shops 1 & 2
    const shops = await models.Shop.findAll({ order: [['id', 'ASC']] });
    expect(shops.length).toBe(2);
    expect(shops.map(s => s.id)).toEqual([1, 2]);

    // Verify baseline Users 1 & 2
    const users = await models.User.findAll({ order: [['id', 'ASC']] });
    expect(users.length).toBe(2);
    expect(users.map(u => u.id)).toEqual([1, 2]);

    // Verify baseline OrganizationMemberships 1 & 2
    const memberships = await models.OrganizationMembership.findAll({ order: [['organizationId', 'ASC']] });
    expect(memberships.length).toBe(2);
    expect(memberships.map(m => m.organizationId)).toEqual([1, 2]);
    expect(memberships.map(m => m.userId)).toEqual([1, 2]);

    // Verify grandfathered Subscriptions 1 & 2
    const subs = await models.Subscription.findAll({ order: [['organizationId', 'ASC']] });
    expect(subs.length).toBe(2);
    expect(subs.map(s => s.organizationId)).toEqual([1, 2]);
    expect(subs.every(s => s.status === 'active')).toBe(true);

    // Verify ephemeral tables are completely empty
    const productCount = await models.Product.count();
    expect(productCount).toBe(0);
    const saleCount = await models.Sale.count();
    expect(saleCount).toBe(0);
    const notifCount = await models.BillingNotificationLog.count();
    expect(notifCount).toBe(0);
  });
});
