'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const {
  sequelize,
  Organization,
  Subscription,
  Plan,
  User,
  Shop,
  Employee,
  Category,
  Product,
  OrganizationMembership,
  ShopAccess,
  SubscriptionInvoice,
  ActivityLog,
  SystemSettings
} = require('../src/models');
const entitlementService = require('../src/services/entitlementService');
const billingService = require('../src/services/billingService');
const { runSubscriptionTransitionJob } = require('../src/services/billingScheduler');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '2h' });
}

describe('Phase 5 — Subscription Lifecycle, Entitlement, Billing & Multi-Tenant Hardening', () => {
  let starterPlan;
  let growthPlan;
  let proPlan;
  let gfPlan;

  beforeAll(async () => {
    await sequelize.authenticate();
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });
    proPlan = await Plan.findOne({ where: { code: 'pro' } });
    gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
  });

  // --------------------------------------------------------------------------
  // 1. P0-01: TRIAL EXPIRATION & AUTHORITATIVE SUBSCRIPTION LIFECYCLE
  // --------------------------------------------------------------------------
  describe('P0-01: Trial Expiration & Effective Status Model', () => {
    test('Trialing subscription with future trialEndsAt is entitled (status=trialing)', () => {
      const now = new Date();
      const futureTrial = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
      const sub = {
        status: 'trialing',
        trialEndsAt: futureTrial,
        currentPeriodEnd: futureTrial
      };

      const status = entitlementService.getEffectiveSubscriptionStatus(sub, now);
      expect(status).toBe('trialing');
    });

    test('Expired trial (trialEndsAt in the past, within 7-day grace) immediately evaluates to past_due without scheduler', () => {
      const now = new Date();
      const pastTrial = new Date(now.getTime() - 2 * 24 * 3600 * 1000); // 2 days expired
      const sub = {
        status: 'trialing',
        trialEndsAt: pastTrial,
        currentPeriodEnd: pastTrial
      };

      const status = entitlementService.getEffectiveSubscriptionStatus(sub, now);
      expect(status).toBe('past_due');
    });

    test('Expired trial (beyond 7-day grace period) immediately evaluates to suspended', () => {
      const now = new Date();
      const longExpiredTrial = new Date(now.getTime() - 8 * 24 * 3600 * 1000); // 8 days expired
      const sub = {
        status: 'trialing',
        trialEndsAt: longExpiredTrial,
        currentPeriodEnd: longExpiredTrial
      };

      const status = entitlementService.getEffectiveSubscriptionStatus(sub, now);
      expect(status).toBe('suspended');
    });

    test('Grandfathered tier is permanently immune to expiration cutoffs', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 100 * 24 * 3600 * 1000);
      const sub = {
        status: 'active',
        currentPeriodEnd: pastDate,
        Plan: { code: 'grandfathered' }
      };

      const status = entitlementService.getEffectiveSubscriptionStatus(sub, now);
      expect(status).toBe('active');
    });

    test('checkAndTransitionExpiredSubscriptions transitions expired trials to past_due/suspended idempotently', async () => {
      const ts = Date.now();
      const org = await Organization.create({
        name: `Trial Exp Org ${ts}`,
        slug: `trial-exp-${ts}`,
        status: 'trialing'
      });
      const sub = await Subscription.create({
        organizationId: org.id,
        planId: growthPlan.id,
        status: 'trialing',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 3600 * 1000),
        currentPeriodEnd: new Date(Date.now() - 1 * 24 * 3600 * 1000),
        trialEndsAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
        cancelAtPeriodEnd: false
      });

      // Run transition job
      const res = await runSubscriptionTransitionJob(new Date());
      expect(res.transitionedToPastDue).toBeGreaterThanOrEqual(1);

      const reloadedSub = await Subscription.findByPk(sub.id);
      expect(reloadedSub.status).toBe('past_due');

      const reloadedOrg = await Organization.findByPk(org.id);
      expect(reloadedOrg.status).toBe('past_due');

      // Idempotency check: running again changes nothing
      const res2 = await runSubscriptionTransitionJob(new Date());
      expect(res2.transitionedToPastDue).toBe(0);

      // Cleanup
      await Subscription.destroy({ where: { id: sub.id } });
      await Organization.destroy({ where: { id: org.id } });
      await entitlementService.invalidateOrgEntitlements(org.id);
    });

    test('Concurrent scheduler executions run safely without race condition', async () => {
      const [res1, res2] = await Promise.all([
        runSubscriptionTransitionJob(new Date()),
        runSubscriptionTransitionJob(new Date())
      ]);
      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. P0-02: CENTRALIZED SUBSCRIPTION ENFORCEMENT & OPERATIONAL BLOCKING
  // --------------------------------------------------------------------------
  describe('P0-02: Subscription Enforcement (Operational Blocking vs Billing Recovery)', () => {
    let suspOrg;
    let suspShop;
    let suspOwner;
    let suspOwnerToken;
    let suspCashier;
    let suspCashierToken;
    let suspSub;
    let category;
    let product;

    beforeAll(async () => {
      const ts = Date.now();
      suspOrg = await Organization.create({
        name: `Suspended Org ${ts}`,
        slug: `susp-org-${ts}`,
        status: 'suspended'
      });
      suspShop = await Shop.create({
        name: `Suspended Branch ${ts}`,
        organizationId: suspOrg.id,
        active: true
      });
      suspOwner = await User.create({
        name: 'Susp Owner',
        email: `susp-owner-${ts}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: suspShop.id
      });
      await OrganizationMembership.create({
        organizationId: suspOrg.id,
        userId: suspOwner.id,
        orgRole: 'owner',
        status: 'active'
      });
      suspOwnerToken = generateToken({
        id: suspOwner.id,
        role: 'admin',
        shopId: suspShop.id,
        organizationId: suspOrg.id,
        isEmployee: false
      });

      suspCashier = await Employee.create({
        firstName: 'Susp',
        lastName: 'Cashier',
        email: `susp-cashier-${ts}@example.com`,
        password: 'password123',
        position: 'cashier',
        salary: 35000,
        shopId: suspShop.id,
        status: 'active'
      });
      await OrganizationMembership.create({
        organizationId: suspOrg.id,
        employeeId: suspCashier.id,
        orgRole: 'member',
        status: 'active'
      });
      suspCashierToken = generateToken({
        id: suspCashier.id,
        role: 'cashier',
        shopId: suspShop.id,
        organizationId: suspOrg.id,
        isEmployee: true
      });

      suspSub = await Subscription.create({
        organizationId: suspOrg.id,
        planId: starterPlan.id,
        status: 'suspended',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(Date.now() - 40 * 24 * 3600 * 1000),
        currentPeriodEnd: new Date(Date.now() - 10 * 24 * 3600 * 1000),
        trialEndsAt: null,
        cancelAtPeriodEnd: false
      });

      category = await Category.create({
        name: `Susp Category ${ts}`,
        organizationId: suspOrg.id,
        shopId: suspShop.id
      });
      product = await Product.create({
        name: `Susp Product ${ts}`,
        sku: `SKU-SUSP-${ts}`,
        price: 100.0,
        cost: 60.0,
        categoryId: category.id,
        organizationId: suspOrg.id,
        shopId: suspShop.id
      });

      await entitlementService.invalidateOrgEntitlements(suspOrg.id);
    });

    afterAll(async () => {
      await ActivityLog.destroy({ where: { shopId: suspShop.id } });
      await Product.destroy({ where: { organizationId: suspOrg.id } });
      await Category.destroy({ where: { organizationId: suspOrg.id } });
      await Subscription.destroy({ where: { organizationId: suspOrg.id } });
      await OrganizationMembership.destroy({ where: { organizationId: suspOrg.id } });
      if (suspCashier?.id) await Employee.destroy({ where: { id: suspCashier.id } });
      if (suspOwner?.id) await User.destroy({ where: { id: suspOwner.id } });
      if (suspShop?.id) await Shop.destroy({ where: { id: suspShop.id } });
      if (suspOrg?.id) await Organization.destroy({ where: { id: suspOrg.id } });
    });

    test('POS Sale creation is rejected with 403 ORGANIZATION_SUSPENDED on suspended tenant', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', suspCashierToken)
        .send({
          items: [{ productId: product.id, quantity: 1, price: 100 }],
          paymentMethod: 'cash',
          paymentAmount: 100,
          total: 100
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    test('Product mutation is rejected with 403 ORGANIZATION_SUSPENDED on suspended tenant', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', suspOwnerToken)
        .send({
          name: 'New Blocked Product',
          price: 50.0,
          cost: 30.0,
          categoryId: category.id
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    test('Stock transfer is rejected with 403 ORGANIZATION_SUSPENDED on suspended tenant', async () => {
      const res = await request(app)
        .post('/api/transfers')
        .set('Authorization', suspOwnerToken)
        .send({
          sourceShopId: suspShop.id,
          destinationShopId: suspShop.id,
          productId: product.id,
          quantity: 1
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    test('Owner CAN access billing endpoints while organization is suspended', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', suspOwnerToken);

      expect(res.status).toBe(200);
      expect(res.body.subscription.status).toBe('suspended');
    });

    test('Non-owner employee login is rejected with 403 when organization is suspended', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: suspCashier.email,
          password: 'password123'
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    test('Owner login SUCCEEDS when organization is suspended to allow billing recovery', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: suspOwner.email,
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.subscriptionStatus).toBe('suspended');
    });
  });

  // --------------------------------------------------------------------------
  // 3. P0-03: ATOMIC BRANCH QUOTA CONCURRENCY
  // --------------------------------------------------------------------------
  describe('P0-03: Atomic Branch Quota & Concurrency Serialization', () => {
    test('Simultaneous branch creations on plan with maxShops=1 serialize: exactly 1 succeeds, 1 fails', async () => {
      const ts = Date.now();
      const org = await Organization.create({
        name: `Quota Concurrency Org ${ts}`,
        slug: `quota-conc-${ts}`,
        status: 'active'
      });
      const existingShop = await Shop.create({
        name: `Existing Main Branch ${ts}`,
        organizationId: org.id,
        active: true
      });
      const owner = await User.create({
        name: 'Quota Owner',
        email: `quota-owner-${ts}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: existingShop.id
      });
      await OrganizationMembership.create({
        organizationId: org.id,
        userId: owner.id,
        orgRole: 'owner',
        status: 'active'
      });
      // Subscription on Growth (maxShops = 3). Existing shops = 1.
      // Can add up to 2 shops (total 3).
      // We will create 1 more shop so count = 2.
      // Then Growth maxShops = 3 has 1 seat remaining.
      // Then two simultaneous creation requests will race for that 1 remaining seat!
      const sub = await Subscription.create({
        organizationId: org.id,
        planId: growthPlan.id, // maxShops = 3
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        trialEndsAt: null,
        cancelAtPeriodEnd: false
      });

      const secondShop = await Shop.create({
        name: `Second Branch ${ts}`,
        organizationId: org.id,
        active: true
      });

      // Now exactly 2 shops active out of 3 allowed. Exactly 1 slot remains!
      const token = generateToken({
        id: owner.id,
        role: 'admin',
        shopId: existingShop.id,
        organizationId: org.id,
        isEmployee: false
      });

      await entitlementService.invalidateOrgEntitlements(org.id);

      // Launch 2 simultaneous POST /api/shops requests
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/shops')
          .set('Authorization', token)
          .send({ name: `Concurrent Branch Alpha ${ts}` }),
        request(app)
          .post('/api/shops')
          .set('Authorization', token)
          .send({ name: `Concurrent Branch Beta ${ts}` })
      ]);

      const statuses = [resA.status, resB.status].sort();
      // Exactly one 201 and one 403 (QUOTA_EXCEEDED)
      expect(statuses).toEqual([201, 403]);

      const failedRes = resA.status === 403 ? resA : resB;
      expect(failedRes.body.upgradeRequired).toBe(true);

      // Verify active shops in database is exactly 3 (maxShops quota never breached)
      const totalActive = await Shop.count({ where: { organizationId: org.id, active: true } });
      expect(totalActive).toBe(3);

      // Cleanup
      const orgShops = await Shop.findAll({ where: { organizationId: org.id }, attributes: ['id'] });
      const shopIds = orgShops.map(s => s.id);
      if (shopIds.length > 0) {
        await ActivityLog.destroy({ where: { shopId: shopIds } });
        await SystemSettings.destroy({ where: { shopId: shopIds } });
      }
      await ShopAccess.destroy({ where: {} });
      await Shop.destroy({ where: { organizationId: org.id } });
      await Subscription.destroy({ where: { id: sub.id } });
      await OrganizationMembership.destroy({ where: { organizationId: org.id } });
      await User.destroy({ where: { id: owner.id } });
      await Organization.destroy({ where: { id: org.id } });
    });
  });

  // --------------------------------------------------------------------------
  // 4. P1-02 & P1-05: BILLING PLAN SECURITY & DOWNGRADE RECONCILIATION
  // --------------------------------------------------------------------------
  describe('P1-02 & P1-05: Plan Security & Downgrade Reconciliation', () => {
    let org;
    let shop1;
    let shop2;
    let owner;
    let ownerToken;
    let sub;

    beforeAll(async () => {
      const ts = Date.now();
      org = await Organization.create({
        name: `Plan Sec Org ${ts}`,
        slug: `plan-sec-${ts}`,
        status: 'active'
      });
      shop1 = await Shop.create({
        name: `Branch 1 ${ts}`,
        organizationId: org.id,
        active: true
      });
      shop2 = await Shop.create({
        name: `Branch 2 ${ts}`,
        organizationId: org.id,
        active: true
      });
      owner = await User.create({
        name: 'Sec Owner',
        email: `sec-owner-${ts}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: shop1.id
      });
      await OrganizationMembership.create({
        organizationId: org.id,
        userId: owner.id,
        orgRole: 'owner',
        status: 'active'
      });

      sub = await Subscription.create({
        organizationId: org.id,
        planId: growthPlan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        trialEndsAt: null,
        cancelAtPeriodEnd: false
      });

      ownerToken = generateToken({
        id: owner.id,
        role: 'admin',
        shopId: shop1.id,
        organizationId: org.id,
        isEmployee: false
      });

      await entitlementService.invalidateOrgEntitlements(org.id);
    });

    afterAll(async () => {
      await SubscriptionInvoice.destroy({ where: { organizationId: org.id } });
      await Subscription.destroy({ where: { id: sub.id } });
      await OrganizationMembership.destroy({ where: { organizationId: org.id } });
      await User.destroy({ where: { id: owner.id } });
      await Shop.destroy({ where: { organizationId: org.id } });
      await Organization.destroy({ where: { id: org.id } });
    });

    test('generateRenewalInvoice rejects grandfathered plan (HTTP 400)', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', ownerToken)
        .send({
          channel: 'mpesa',
          phone: '254712345678',
          planId: gfPlan.id
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PLAN');
    });

    test('generateRenewalInvoice rejects unknown plan (HTTP 404)', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', ownerToken)
        .send({
          channel: 'mpesa',
          phone: '254712345678',
          planId: 999999
        });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PLAN_NOT_FOUND');
    });

    test('generateRenewalInvoice blocks plan downgrade when active resources exceed new limits (HTTP 409 PLAN_RESOURCE_CONFLICT)', async () => {
      // Organization has 2 active shops. Starter plan allows only maxShops = 1.
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', ownerToken)
        .send({
          channel: 'mpesa',
          phone: '254712345678',
          planId: starterPlan.id
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PLAN_RESOURCE_CONFLICT');
      expect(res.body.shops).toBeDefined();
      expect(res.body.shops.limit).toBe(1);
      expect(res.body.shops.active).toBe(2);
    });

    test('Invoice idempotency: repeated renewal requests within 1 hour reuse active pending invoice without duplication', async () => {
      // Clean previous invoices
      await SubscriptionInvoice.destroy({ where: { organizationId: org.id } });

      const res1 = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', ownerToken)
        .send({
          channel: 'card',
          planId: growthPlan.id
        });

      expect(res1.status).toBe(200);
      const invoiceId1 = res1.body.invoiceId;

      const res2 = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', ownerToken)
        .send({
          channel: 'card',
          planId: growthPlan.id
        });

      expect(res2.status).toBe(200);
      const invoiceId2 = res2.body.invoiceId;

      // Must reuse identical invoice without spamming pending records
      expect(invoiceId1).toBe(invoiceId2);

      const count = await SubscriptionInvoice.count({
        where: { organizationId: org.id, status: 'pending' }
      });
      expect(count).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 5. P1-03 & P1-04: SHOP ACCESS DELEGATION & TENANT-WIDE MEMBERS
  // --------------------------------------------------------------------------
  describe('P1-03 & P1-04: Shop Access & Tenant-Wide Member Management', () => {
    let orgA;
    let shopA1;
    let shopA2;
    let ownerA;
    let ownerAToken;
    let cashierA;
    let memberA;

    let orgB;
    let shopB;
    let ownerB;

    beforeAll(async () => {
      const ts = Date.now();
      // Org A
      orgA = await Organization.create({ name: `Org A ${ts}`, slug: `org-a-${ts}`, status: 'active' });
      shopA1 = await Shop.create({ name: `Shop A1 ${ts}`, organizationId: orgA.id, active: true });
      shopA2 = await Shop.create({ name: `Shop A2 ${ts}`, organizationId: orgA.id, active: true });
      ownerA = await User.create({ name: 'Owner A', email: `owner-a-${ts}@example.com`, password: 'password123', role: 'admin', shopId: shopA1.id });
      await OrganizationMembership.create({ organizationId: orgA.id, userId: ownerA.id, orgRole: 'owner', status: 'active' });

      cashierA = await Employee.create({
        firstName: 'Cashier',
        lastName: 'A',
        email: `cashier-a-${ts}@example.com`,
        password: 'password123',
        position: 'cashier',
        salary: 32000,
        shopId: shopA1.id,
        status: 'active'
      });
      memberA = await OrganizationMembership.create({ organizationId: orgA.id, employeeId: cashierA.id, orgRole: 'member', status: 'active' });

      ownerAToken = generateToken({ id: ownerA.id, role: 'admin', shopId: shopA1.id, organizationId: orgA.id, isEmployee: false });

      await Subscription.create({
        organizationId: orgA.id,
        planId: growthPlan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000)
      });

      // Org B
      orgB = await Organization.create({ name: `Org B ${ts}`, slug: `org-b-${ts}`, status: 'active' });
      shopB = await Shop.create({ name: `Shop B ${ts}`, organizationId: orgB.id, active: true });
      ownerB = await User.create({ name: 'Owner B', email: `owner-b-${ts}@example.com`, password: 'password123', role: 'admin', shopId: shopB.id });
      await OrganizationMembership.create({ organizationId: orgB.id, userId: ownerB.id, orgRole: 'owner', status: 'active' });

      await Subscription.create({
        organizationId: orgB.id,
        planId: starterPlan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000)
      });

      await entitlementService.invalidateOrgEntitlements(orgA.id);
      await entitlementService.invalidateOrgEntitlements(orgB.id);
    });

    afterAll(async () => {
      await ShopAccess.destroy({ where: {} });
      if (orgA?.id && orgB?.id) {
        await Subscription.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
        await ActivityLog.destroy({ where: { shopId: [shopA1?.id, shopA2?.id, shopB?.id].filter(Boolean) } });
        await OrganizationMembership.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      }
      if (cashierA?.id) await Employee.destroy({ where: { id: cashierA.id } });
      if (ownerA?.id && ownerB?.id) await User.destroy({ where: { id: [ownerA.id, ownerB.id] } });
      if (orgA?.id && orgB?.id) {
        await Shop.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
        await Organization.destroy({ where: { id: [orgA.id, orgB.id] } });
      }
    });

    test('Owner can grant branch access to member: POST /api/shops/:id/access', async () => {
      const res = await request(app)
        .post(`/api/shops/${shopA2.id}/access`)
        .set('Authorization', ownerAToken)
        .send({
          membershipId: memberA.id,
          isDefault: true
        });

      expect(res.status).toBe(201);
      expect(res.body.access).toBeDefined();
      expect(res.body.access.shopId).toBe(shopA2.id);
    });

    test('Duplicate branch access assignment is rejected with 400', async () => {
      const res = await request(app)
        .post(`/api/shops/${shopA2.id}/access`)
        .set('Authorization', ownerAToken)
        .send({
          membershipId: memberA.id
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/already has access/i);
    });

    test('Cross-tenant access grant is rejected: cannot assign membership from Org B to Org A shop', async () => {
      const memberB = await OrganizationMembership.findOne({ where: { organizationId: orgB.id } });

      const res = await request(app)
        .post(`/api/shops/${shopA1.id}/access`)
        .set('Authorization', ownerAToken)
        .send({
          membershipId: memberB.id
        });

      expect(res.status).toBe(404);
    });

    test('GET /api/organizations/members returns tenant members with accessible shops and strict tenant isolation', async () => {
      const res = await request(app)
        .get('/api/organizations/members')
        .set('Authorization', ownerAToken);

      expect(res.status).toBe(200);
      expect(res.body.members).toBeDefined();
      expect(res.body.totalMembers).toBe(2);

      // Verify no Org B member leaks
      const emails = res.body.members.map(m => m.email);
      expect(emails).toContain(ownerA.email);
      expect(emails).toContain(cashierA.email);
      expect(emails).not.toContain(ownerB.email);
    });

    test('Owner can revoke branch access: DELETE /api/shops/:id/access/:membershipId', async () => {
      const res = await request(app)
        .delete(`/api/shops/${shopA2.id}/access/${memberA.id}`)
        .set('Authorization', ownerAToken);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/revoked successfully/i);
    });
  });

  // --------------------------------------------------------------------------
  // 6. P2-03 & P2-04: SUBSCRIPTION CANCELLATION & REVERSIBLE BRANCH LIFECYCLE
  // --------------------------------------------------------------------------
  describe('P2-03 & P2-04: Cancellation & Reversible Branch Lifecycle', () => {
    let org;
    let shop1;
    let shop2;
    let owner;
    let ownerToken;
    let sub;

    beforeAll(async () => {
      const ts = Date.now();
      org = await Organization.create({ name: `Life Org ${ts}`, slug: `life-${ts}`, status: 'active' });
      shop1 = await Shop.create({ name: `Life Shop 1 ${ts}`, organizationId: org.id, active: true });
      shop2 = await Shop.create({ name: `Life Shop 2 ${ts}`, organizationId: org.id, active: true });
      owner = await User.create({ name: 'Life Owner', email: `life-owner-${ts}@example.com`, password: 'password123', role: 'admin', shopId: shop1.id });
      await OrganizationMembership.create({ organizationId: org.id, userId: owner.id, orgRole: 'owner', status: 'active' });

      sub = await Subscription.create({
        organizationId: org.id,
        planId: growthPlan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 20 * 24 * 3600 * 1000),
        trialEndsAt: null,
        cancelAtPeriodEnd: false
      });

      ownerToken = generateToken({ id: owner.id, role: 'admin', shopId: shop1.id, organizationId: org.id, isEmployee: false });
    });

    afterAll(async () => {
      await ActivityLog.destroy({ where: { shopId: [shop1.id, shop2.id] } });
      await Subscription.destroy({ where: { organizationId: org.id } });
      await OrganizationMembership.destroy({ where: { organizationId: org.id } });
      await User.destroy({ where: { id: owner.id } });
      await Shop.destroy({ where: { organizationId: org.id } });
      await Organization.destroy({ where: { id: org.id } });
    });

    test('POST /api/billing/subscription/cancel schedules cancellation at period end', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/cancel')
        .set('Authorization', ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.subscription.cancelAtPeriodEnd).toBe(true);

      const reloaded = await Subscription.findByPk(sub.id);
      expect(reloaded.cancelAtPeriodEnd).toBe(true);
    });

    test('POST /api/billing/subscription/reactivate clears scheduled cancellation', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/reactivate')
        .set('Authorization', ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.subscription.cancelAtPeriodEnd).toBe(false);

      const reloaded = await Subscription.findByPk(sub.id);
      expect(reloaded.cancelAtPeriodEnd).toBe(false);
    });

    test('PATCH /api/shops/:id/deactivate successfully deactivates branch', async () => {
      const res = await request(app)
        .patch(`/api/shops/${shop2.id}/deactivate`)
        .set('Authorization', ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.shop.active).toBe(false);

      const reloaded = await Shop.findByPk(shop2.id);
      expect(reloaded.active).toBe(false);
    });

    test('PATCH /api/shops/:id/deactivate rejects deactivating sole active branch (HTTP 400)', async () => {
      // shop2 is deactivated, so shop1 is the only active branch left
      const res = await request(app)
        .patch(`/api/shops/${shop1.id}/deactivate`)
        .set('Authorization', ownerToken);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/sole active branch/i);
    });

    test('PATCH /api/shops/:id/activate reactivates branch', async () => {
      const res = await request(app)
        .patch(`/api/shops/${shop2.id}/activate`)
        .set('Authorization', ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.shop.active).toBe(true);

      const reloaded = await Shop.findByPk(shop2.id);
      expect(reloaded.active).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 7. P3-02: REGISTRATION STATUS CONSISTENCY
  // --------------------------------------------------------------------------
  describe('P3-02: Organization & Subscription Registration Consistency', () => {
    test('POST /api/auth/register sets Organization.status = trialing and Subscription.status = trialing', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Trial Master',
          email: `trial-reg-${ts}@example.com`,
          password: 'Password123!',
          shop: {
            name: `Trial Store ${ts}`
          }
        });

      expect(res.status).toBe(201);
      const orgId = res.body.user?.shop?.organizationId;
      expect(orgId).toBeDefined();

      const org = await Organization.findByPk(orgId);
      expect(org.status).toBe('trialing');

      const sub = await Subscription.findOne({ where: { organizationId: orgId } });
      expect(sub.status).toBe('trialing');

      // Cleanup
      await Subscription.destroy({ where: { organizationId: orgId } });
      await OrganizationMembership.destroy({ where: { organizationId: orgId } });
      await User.destroy({ where: { id: res.body.user.id } });
      const regShops = await Shop.findAll({ where: { organizationId: orgId }, attributes: ['id'] });
      const regShopIds = regShops.map(s => s.id);
      if (regShopIds.length > 0) {
        await ActivityLog.destroy({ where: { shopId: regShopIds } });
        await SystemSettings.destroy({ where: { shopId: regShopIds } });
      }
      await Shop.destroy({ where: { organizationId: orgId } });
      await Organization.destroy({ where: { id: orgId } });
    });
  });
});
