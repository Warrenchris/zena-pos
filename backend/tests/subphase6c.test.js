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
  Employee,
  Shop,
  OrganizationMembership,
  ShopAccess,
  ActivityLog,
  Sale,
  SaleItem,
  SalePayment,
  Product,
  Inventory
} = require('../src/models');
const entitlementService = require('../src/services/entitlementService');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Sub-Phase 6c: Entitlement Wiring & Subscription Registration', () => {
  let starterPlan;
  let growthPlan;
  let gfPlan;

  beforeAll(async () => {
    await sequelize.authenticate();
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });
    gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
  });

  beforeEach(async () => {
    const redisClient = require('../src/config/redis');
    if (redisClient && redisClient.status === 'ready') {
      try {
        const keys = await redisClient.keys('cache:entitlements:org:*');
        if (keys && keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch (_) {}
    }
  });

  afterAll(async () => {
    // Global teardown if any
  });

  test('Grandfathered organization: unlimited branch quota, seat quota, and org_insights unlocked', async () => {
    const ts = Date.now();
    const gfOrg = await Organization.create({
      name: `GF Org Test ${ts}`,
      slug: `gf-org-${ts}`,
      status: 'active'
    });

    await Subscription.create({
      organizationId: gfOrg.id,
      planId: gfPlan.id,
      status: 'active',
      billingCycle: 'yearly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });

    const gfShop = await Shop.create({
      name: `GF Shop 1 ${ts}`,
      organizationId: gfOrg.id,
      active: true
    });

    const gfOwner = await User.create({
      name: 'GF Owner',
      email: `gf-owner-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: gfShop.id
    });

    await OrganizationMembership.create({
      organizationId: gfOrg.id,
      userId: gfOwner.id,
      orgRole: 'owner',
      status: 'active'
    });

    const token = generateToken({
      id: gfOwner.id,
      email: gfOwner.email,
      role: 'admin',
      shopId: gfShop.id,
      organizationId: gfOrg.id,
      isEmployee: false
    });

    // 1. Create 2nd shop (allowed under grandfathered unlimited quota)
    const shopRes = await request(app)
      .post('/api/shop')
      .set('Authorization', token)
      .send({ name: `GF Shop 2 ${ts}` });
    expect(shopRes.status).toBe(201);

    // 2. Create employee (allowed under grandfathered unlimited quota)
    const empRes = await request(app)
      .post('/api/employees')
      .set('Authorization', token)
      .send({
        firstName: 'GF',
        lastName: 'Cashier',
        email: `gf-cashier-${ts}@test.com`,
        position: 'cashier',
        status: 'active',
        password: 'Password123!',
        salary: 15000
      });
    expect(empRes.status).toBe(201);

    // 3. Access org_insights (allowed under grandfathered plan)
    const insightsRes = await request(app)
      .get('/api/insights/organization/summary')
      .set('Authorization', token);
    expect(insightsRes.status).toBe(200);

    // Teardown
    await ActivityLog.destroy({ where: { shopId: [gfShop.id, shopRes.body.shop.id] } });
    await Employee.destroy({ where: { id: empRes.body.id } });
    await User.destroy({ where: { id: gfOwner.id } });
    await Shop.destroy({ where: { id: [gfShop.id, shopRes.body.shop.id] } });
    await Subscription.destroy({ where: { organizationId: gfOrg.id } });
    await OrganizationMembership.destroy({ where: { organizationId: gfOrg.id } });
    await Organization.destroy({ where: { id: gfOrg.id } });
    await entitlementService.invalidateOrgEntitlements(gfOrg.id);
  });

  test('Starter tier: branch quota rejection (maxShops: 1) with structured upgrade prompt', async () => {
    const ts = Date.now();
    const starterOrg = await Organization.create({
      name: `Starter Branch Org ${ts}`,
      slug: `starter-branch-${ts}`,
      status: 'active'
    });

    await Subscription.create({
      organizationId: starterOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });

    const shop1 = await Shop.create({
      name: `Starter Shop 1 ${ts}`,
      organizationId: starterOrg.id,
      active: true
    });

    const owner = await User.create({
      name: 'Starter Owner',
      email: `starter-branch-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: shop1.id
    });

    await OrganizationMembership.create({
      organizationId: starterOrg.id,
      userId: owner.id,
      orgRole: 'owner',
      status: 'active'
    });

    const token = generateToken({
      id: owner.id,
      email: owner.email,
      role: 'admin',
      shopId: shop1.id,
      organizationId: starterOrg.id,
      isEmployee: false
    });

    // Attempt to create a 2nd shop (maxShops: 1)
    const res = await request(app)
      .post('/api/shop')
      .set('Authorization', token)
      .send({ name: `Starter Shop 2 ${ts}` });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(res.body.quota).toBe('maxShops');
    expect(res.body.limit).toBe(1);
    expect(res.body.current).toBe(1);
    expect(res.body.currentPlan).toBe('starter');
    expect(res.body.requiredPlan).toBe('growth');

    // Confirm zero partial mutation
    const shopCount = await Shop.count({ where: { organizationId: starterOrg.id } });
    expect(shopCount).toBe(1);

    // Teardown
    await ActivityLog.destroy({ where: { shopId: shop1.id } });
    await User.destroy({ where: { id: owner.id } });
    await Shop.destroy({ where: { id: shop1.id } });
    await Subscription.destroy({ where: { organizationId: starterOrg.id } });
    await OrganizationMembership.destroy({ where: { organizationId: starterOrg.id } });
    await Organization.destroy({ where: { id: starterOrg.id } });
    await entitlementService.invalidateOrgEntitlements(starterOrg.id);
  });

  test('Starter tier: seat quota counts BOTH Users and Employees, rejects at limit (maxUsers: 2)', async () => {
    const ts = Date.now();
    const starterOrg = await Organization.create({
      name: `Starter Seat Org ${ts}`,
      slug: `starter-seat-${ts}`,
      status: 'active'
    });

    await Subscription.create({
      organizationId: starterOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });

    const shop = await Shop.create({
      name: `Starter Seat Shop ${ts}`,
      organizationId: starterOrg.id,
      active: true
    });

    const user1 = await User.create({
      name: 'Starter Owner',
      email: `starter-seat-owner-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: shop.id
    });

    await OrganizationMembership.create({
      organizationId: starterOrg.id,
      userId: user1.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Add 2nd User with active membership -> 2 active members out of 2 limit
    const user2 = await User.create({
      name: 'Starter Staff',
      email: `starter-seat-staff-${ts}@test.com`,
      password: 'password123',
      role: 'manager',
      shopId: shop.id
    });

    await OrganizationMembership.create({
      organizationId: starterOrg.id,
      userId: user2.id,
      orgRole: 'member',
      status: 'active'
    });

    const token = generateToken({
      id: user1.id,
      email: user1.email,
      role: 'admin',
      shopId: shop.id,
      organizationId: starterOrg.id,
      isEmployee: false
    });

    // Attempt to add employee -> should be rejected 403 QUOTA_EXCEEDED
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', token)
      .send({
        firstName: 'Blocked',
        lastName: 'Cashier',
        email: `blocked-${ts}@test.com`,
        position: 'cashier',
        status: 'active',
        password: 'Password123!',
        salary: 15000
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('QUOTA_EXCEEDED');
    expect(res.body.quota).toBe('maxUsers');
    expect(res.body.limit).toBe(2);
    expect(res.body.current).toBe(2);
    expect(res.body.currentPlan).toBe('starter');
    expect(res.body.requiredPlan).toBe('growth');

    // Confirm zero orphaned employee rows
    const empCount = await Employee.count({ where: { shopId: shop.id } });
    expect(empCount).toBe(0);

    // Teardown
    await User.destroy({ where: { id: [user1.id, user2.id] } });
    await Shop.destroy({ where: { id: shop.id } });
    await Subscription.destroy({ where: { organizationId: starterOrg.id } });
    await OrganizationMembership.destroy({ where: { organizationId: starterOrg.id } });
    await Organization.destroy({ where: { id: starterOrg.id } });
    await entitlementService.invalidateOrgEntitlements(starterOrg.id);
  });

  test('Feature gating: org_insights rejected on Starter tier, allowed on Growth tier', async () => {
    const ts = Date.now();
    // 1. Starter Org
    const starterOrg = await Organization.create({
      name: `Starter Gate Org ${ts}`,
      slug: `starter-gate-${ts}`,
      status: 'active'
    });
    await Subscription.create({
      organizationId: starterOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });
    const starterShop = await Shop.create({
      name: `Starter Gate Shop ${ts}`,
      organizationId: starterOrg.id,
      active: true
    });
    const starterOwner = await User.create({
      name: 'Starter Gate Owner',
      email: `starter-gate-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: starterShop.id
    });
    await OrganizationMembership.create({
      organizationId: starterOrg.id,
      userId: starterOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    const starterToken = generateToken({
      id: starterOwner.id,
      email: starterOwner.email,
      role: 'admin',
      shopId: starterShop.id,
      organizationId: starterOrg.id,
      isEmployee: false
    });

    const starterRes = await request(app)
      .get('/api/insights/organization/summary')
      .set('Authorization', starterToken);
    expect(starterRes.status).toBe(403);
    expect(starterRes.body.code).toBe('FEATURE_NOT_AVAILABLE');
    expect(starterRes.body.feature).toBe('org_insights');
    expect(starterRes.body.currentPlan).toBe('starter');
    expect(starterRes.body.requiredPlan).toBe('growth');

    // 2. Growth Org
    const growthOrg = await Organization.create({
      name: `Growth Gate Org ${ts}`,
      slug: `growth-gate-${ts}`,
      status: 'active'
    });
    await Subscription.create({
      organizationId: growthOrg.id,
      planId: growthPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });
    const growthShop = await Shop.create({
      name: `Growth Gate Shop ${ts}`,
      organizationId: growthOrg.id,
      active: true
    });
    const growthOwner = await User.create({
      name: 'Growth Gate Owner',
      email: `growth-gate-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: growthShop.id
    });
    await OrganizationMembership.create({
      organizationId: growthOrg.id,
      userId: growthOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    const growthToken = generateToken({
      id: growthOwner.id,
      email: growthOwner.email,
      role: 'admin',
      shopId: growthShop.id,
      organizationId: growthOrg.id,
      isEmployee: false
    });

    const growthRes = await request(app)
      .get('/api/insights/organization/summary')
      .set('Authorization', growthToken);
    expect(growthRes.status).toBe(200);

    // Teardown
    await User.destroy({ where: { id: [starterOwner.id, growthOwner.id] } });
    await Shop.destroy({ where: { id: [starterShop.id, growthShop.id] } });
    await Subscription.destroy({ where: { organizationId: [starterOrg.id, growthOrg.id] } });
    await OrganizationMembership.destroy({ where: { organizationId: [starterOrg.id, growthOrg.id] } });
    await Organization.destroy({ where: { id: [starterOrg.id, growthOrg.id] } });
    await entitlementService.invalidateOrgEntitlements(starterOrg.id);
    await entitlementService.invalidateOrgEntitlements(growthOrg.id);
  });

  test('New registration creates a real trialing Growth subscription', async () => {
    const ts = Date.now();
    const email = `new-reg-${ts}@test.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'New Registered Merchant',
        email,
        password: 'Password123!',
        shop: {
          name: `New Shop ${ts}`,
          address: 'CBD Nairobi',
          phone: '+254700000000'
        }
      });

    expect(res.status).toBe(201);
    const orgId = res.body.user?.shop?.organizationId;
    expect(orgId).toBeDefined();

    const sub = await Subscription.findOne({ where: { organizationId: orgId } });
    expect(sub).toBeDefined();
    expect(sub.status).toBe('trialing');
    expect(sub.planId).toBe(growthPlan.id);
    expect(sub.trialEndsAt).toBeDefined();

    const daysUntilEnd = Math.round((new Date(sub.trialEndsAt).getTime() - Date.now()) / (24 * 3600 * 1000));
    expect(daysUntilEnd).toBe(14);

    // Entitlements should return Growth access
    const insightsEntitlement = await entitlementService.canUseFeature(orgId, 'org_insights');
    expect(insightsEntitlement.allowed).toBe(true);

    const quotaEntitlement = await entitlementService.checkQuota(orgId, 'maxShops', 1);
    expect(quotaEntitlement.allowed).toBe(true);
    expect(quotaEntitlement.limit).toBe(3);

    // Teardown
    await ActivityLog.destroy({ where: { shopId: res.body.user.shop.id } });
    await Subscription.destroy({ where: { organizationId: orgId } });
    await OrganizationMembership.destroy({ where: { organizationId: orgId } });
    await User.destroy({ where: { id: res.body.user.id } });
    await Shop.destroy({ where: { id: res.body.user.shop.id } });
    await Organization.destroy({ where: { id: orgId } });
    await entitlementService.invalidateOrgEntitlements(orgId);
  });

  test('Suspended org: blocks branch and employee creation, but core Sale creation is NEVER blocked', async () => {
    const ts = Date.now();
    const org = await Organization.create({
      name: `Suspended Sale Org ${ts}`,
      slug: `susp-sale-${ts}`,
      status: 'suspended'
    });

    await Subscription.create({
      organizationId: org.id,
      planId: growthPlan.id,
      status: 'suspended',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      currentPeriodEnd: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });

    const shop = await Shop.create({
      name: `Suspended Shop ${ts}`,
      organizationId: org.id,
      active: true
    });

    const owner = await User.create({
      name: 'Suspended Owner',
      email: `susp-owner-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: shop.id
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: owner.id,
      orgRole: 'owner',
      status: 'active'
    });

    const token = generateToken({
      id: owner.id,
      email: owner.email,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    // 1. Branch creation is blocked
    const shopRes = await request(app)
      .post('/api/shop')
      .set('Authorization', token)
      .send({ name: `Blocked Shop ${ts}` });
    expect(shopRes.status).toBe(403);
    expect(shopRes.body.code).toBe('SUBSCRIPTION_SUSPENDED');

    // 2. Employee creation is blocked
    const empRes = await request(app)
      .post('/api/employees')
      .set('Authorization', token)
      .send({
        firstName: 'Blocked',
        lastName: 'Cashier',
        email: `blocked-susp-${ts}@test.com`,
        position: 'cashier',
        status: 'active',
        password: 'Password123!',
        salary: 15000
      });
    expect(empRes.status).toBe(403);
    expect(empRes.body.code).toBe('SUBSCRIPTION_SUSPENDED');

    // 3. Org insights blocked
    const insightsRes = await request(app)
      .get('/api/insights/organization/summary')
      .set('Authorization', token);
    expect(insightsRes.status).toBe(403);
    expect(insightsRes.body.code).toBe('SUBSCRIPTION_SUSPENDED');

    // 4. ZERO SALES BLOCKING INVARIANT: Sale creation SUCCEEDS!
    const product = await Product.create({
      name: `Test Product Susp ${ts}`,
      sku: `SKU-SUSP-${ts}`,
      price: 100,
      cost: 50,
      stock: 20,
      shopId: shop.id,
      organizationId: org.id
    });

    await Inventory.create({
      productId: product.id,
      shopId: shop.id,
      stockQuantity: 20,
      reorderPoint: 2
    });

    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        items: [
          {
            productId: product.id,
            quantity: 1,
            price: 100
          }
        ],
        paymentMethod: 'cash',
        paymentAmount: 100,
        subtotal: 100,
        total: 100,
        amountPaid: 100
      });

    expect(saleRes.status).toBe(201);
    expect(saleRes.body.id || saleRes.body.sale?.id).toBeDefined();

    // Teardown
    const saleId = saleRes.body.id || saleRes.body.sale?.id;
    if (saleId) {
      await SalePayment.destroy({ where: { saleId } });
      await SaleItem.destroy({ where: { saleId } });
      await Sale.destroy({ where: { id: saleId } });
    }
    await Inventory.destroy({ where: { productId: product.id } });
    await Product.destroy({ where: { id: product.id } });
    await ActivityLog.destroy({ where: { shopId: shop.id } });
    await User.destroy({ where: { id: owner.id } });
    await Shop.destroy({ where: { id: shop.id } });
    await Subscription.destroy({ where: { organizationId: org.id } });
    await OrganizationMembership.destroy({ where: { organizationId: org.id } });
    await Organization.destroy({ where: { id: org.id } });
    await entitlementService.invalidateOrgEntitlements(org.id);
  });
});
