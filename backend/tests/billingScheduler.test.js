'use strict';

const {
  sequelize,
  Organization,
  Subscription,
  Plan,
  Shop,
  ActivityLog
} = require('../src/models');
const {
  runSubscriptionTransitionJob,
  startBillingScheduler,
  stopBillingScheduler,
  getSchedulerStatus
} = require('../src/services/billingScheduler');
const entitlementService = require('../src/services/entitlementService');

describe('Billing Scheduler Service', () => {
  let starterPlan;
  let gfPlan;

  beforeAll(async () => {
    await sequelize.authenticate();
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
  });

  afterEach(() => {
    stopBillingScheduler();
  });

  test('startBillingScheduler returns null and does not schedule when NODE_ENV === "test"', () => {
    expect(process.env.NODE_ENV).toBe('test');
    const timer = startBillingScheduler();
    expect(timer).toBeNull();
    const status = getSchedulerStatus();
    expect(status.isRunning).toBe(false);
  });

  test('runSubscriptionTransitionJob executes and transitions expired subscriptions end-to-end', async () => {
    const ts = Date.now();

    // 1. Create an expired organization & subscription
    const expiredOrg = await Organization.create({
      name: `Scheduler Expired Org ${ts}`,
      slug: `sched-exp-${ts}`,
      status: 'active'
    });
    const expiredShop = await Shop.create({
      name: `Scheduler Expired Shop ${ts}`,
      organizationId: expiredOrg.id,
      active: true
    });
    const expiredSub = await Subscription.create({
      organizationId: expiredOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(Date.now() - 32 * 24 * 3600 * 1000),
      currentPeriodEnd: new Date(Date.now() - 1 * 24 * 3600 * 1000), // expired 1 day ago
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });

    // 2. Create a grandfathered subscription
    const gfOrg = await Organization.create({
      name: `Scheduler GF Org ${ts}`,
      slug: `sched-gf-${ts}`,
      status: 'active'
    });
    const gfShop = await Shop.create({
      name: `Scheduler GF Shop ${ts}`,
      organizationId: gfOrg.id,
      active: true
    });
    const gfSub = await Subscription.create({
      organizationId: gfOrg.id,
      planId: gfPlan.id,
      status: 'active',
      billingCycle: 'yearly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });

    // Run transition job
    const result1 = await runSubscriptionTransitionJob(new Date());
    expect(result1.transitionedToPastDue).toBeGreaterThanOrEqual(1);

    // Verify expired subscription transitioned to 'past_due'
    const reloadedExpiredSub = await Subscription.findByPk(expiredSub.id);
    expect(reloadedExpiredSub.status).toBe('past_due');

    // Verify grandfathered subscription remained 'active'
    const reloadedGfSub = await Subscription.findByPk(gfSub.id);
    expect(reloadedGfSub.status).toBe('active');
    expect(new Date(reloadedGfSub.currentPeriodEnd).getFullYear()).toBe(2099);

    // Verify status tracking
    const status = getSchedulerStatus();
    expect(status.lastRunAt).toBeDefined();
    expect(status.lastRunResult).toBeDefined();

    // Now simulate grace period lapse (8 days expired)
    await reloadedExpiredSub.update({
      currentPeriodEnd: new Date(Date.now() - 8 * 24 * 3600 * 1000)
    });

    const result2 = await runSubscriptionTransitionJob(new Date());
    expect(result2.transitionedToSuspended).toBeGreaterThanOrEqual(1);

    const reloadedSuspendedSub = await Subscription.findByPk(expiredSub.id);
    expect(reloadedSuspendedSub.status).toBe('suspended');

    const reloadedOrg = await Organization.findByPk(expiredOrg.id);
    expect(reloadedOrg.status).toBe('suspended');

    // Teardown
    await ActivityLog.destroy({ where: { shopId: [expiredShop.id, gfShop.id] } });
    await Subscription.destroy({ where: { id: [expiredSub.id, gfSub.id] } });
    await Shop.destroy({ where: { id: [expiredShop.id, gfShop.id] } });
    await Organization.destroy({ where: { id: [expiredOrg.id, gfOrg.id] } });
    await entitlementService.invalidateOrgEntitlements(expiredOrg.id);
    await entitlementService.invalidateOrgEntitlements(gfOrg.id);
  });

  test('Scheduler lifecycle: start with custom interval and stop cleans up gracefully', async () => {
    // Temporarily mock NODE_ENV
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const timer = startBillingScheduler({ intervalMs: 50, warmupDelayMs: 10 });
      expect(timer).not.toBeNull();
      expect(getSchedulerStatus().isRunning).toBe(true);

      // Calling start again returns existing timer
      const timer2 = startBillingScheduler();
      expect(timer2).toBe(timer);

      // Wait 30ms to allow warmup check to trigger
      await new Promise(resolve => setTimeout(resolve, 30));

      stopBillingScheduler();
      expect(getSchedulerStatus().isRunning).toBe(false);
    } finally {
      process.env.NODE_ENV = originalEnv;
      stopBillingScheduler();
    }
  });
});
