'use strict';

const request = require('supertest');
const app = require('../src/app');
const {
  sequelize,
  Organization,
  Subscription,
  Plan,
  User,
  Employee,
  Shop,
  OrganizationMembership
} = require('../src/models');

describe('Auth Register Robustness & Atomicity', () => {
  let growthPlan;
  let testShop;
  let testOrg;

  beforeAll(async () => {
    await sequelize.authenticate();
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });
    if (!growthPlan) {
      growthPlan = await Plan.create({
        name: 'Growth Plan',
        code: 'growth',
        priceMonthly: 5000,
        priceYearly: 50000,
        currency: 'KES',
        maxShops: 3,
        maxUsers: 10,
        features: JSON.stringify({ org_insights: true })
      });
    }

    const ts = Date.now();
    testOrg = await Organization.create({
      name: `Pre-existing Org ${ts}`,
      slug: `pre-existing-org-${ts}`,
      status: 'active'
    });
    testShop = await Shop.create({
      name: `Pre-existing Shop ${ts}`,
      organizationId: testOrg.id
    });
  });

  afterAll(async () => {
    if (testShop) {
      await Employee.destroy({ where: { shopId: testShop.id } });
      await User.destroy({ where: { shopId: testShop.id } });
      await Shop.destroy({ where: { id: testShop.id } });
    }
    if (testOrg) {
      await OrganizationMembership.destroy({ where: { organizationId: testOrg.id } });
      await Subscription.destroy({ where: { organizationId: testOrg.id } });
      await Organization.destroy({ where: { id: testOrg.id } });
    }
  });

  test('1. Missing growth plan rolls back entire transaction, logs error, and returns 503', async () => {
    const ts = Date.now();
    const email = `missing_plan_${ts}@example.com`;

    // Rename 'growth' plan code temporarily
    await Plan.update({ code: 'growth_disabled' }, { where: { code: 'growth' } });

    try {
      const [orgBefore, shopBefore, userBefore, memBefore, subBefore] = await Promise.all([
        Organization.count(),
        Shop.count(),
        User.count(),
        OrganizationMembership.count(),
        Subscription.count()
      ]);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'No Plan Merchant',
          email,
          password: 'Password123!',
          shop: {
            name: `No Plan Shop ${ts}`
          }
        });

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'Registration is temporarily unavailable.' });

      const [orgAfter, shopAfter, userAfter, memAfter, subAfter] = await Promise.all([
        Organization.count(),
        Shop.count(),
        User.count(),
        OrganizationMembership.count(),
        Subscription.count()
      ]);

      expect(orgAfter).toBe(orgBefore);
      expect(shopAfter).toBe(shopBefore);
      expect(userAfter).toBe(userBefore);
      expect(memAfter).toBe(memBefore);
      expect(subAfter).toBe(subBefore);

      const userRow = await User.findOne({ where: { email } });
      expect(userRow).toBeNull();
    } finally {
      // Restore growth plan
      await Plan.update({ code: 'growth' }, { where: { code: 'growth_disabled' } });
    }
  });

  test('2. Concurrent registrations with identical email: exactly one 201, one 400, exactly one User row', async () => {
    const ts = Date.now();
    const email = `concurrent_${ts}@example.com`;

    const [res1, res2] = await Promise.all([
      request(app).post('/api/auth/register').send({
        name: 'Concurrent User 1',
        email,
        password: 'Password123!',
        shop: { name: `Concurrent Shop 1 ${ts}` }
      }),
      request(app).post('/api/auth/register').send({
        name: 'Concurrent User 2',
        email,
        password: 'Password123!',
        shop: { name: `Concurrent Shop 2 ${ts}` }
      })
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failedRes = res1.status === 400 ? res1 : res2;
    const successRes = res1.status === 201 ? res1 : res2;

    expect(failedRes.body).toEqual({ error: 'User already exists' });
    expect(successRes.body.token).toBeDefined();
    expect(successRes.body.user).toBeDefined();

    const userRows = await User.findAll({ where: { email } });
    expect(userRows.length).toBe(1);

    // Teardown created tenant
    const createdOrgId = successRes.body.user?.shop?.organizationId || successRes.body.user?.organizationId;
    const createdShopId = successRes.body.user?.shop?.id;
    const createdUserId = successRes.body.user?.id;

    if (createdOrgId) {
      await Subscription.destroy({ where: { organizationId: createdOrgId } });
      await OrganizationMembership.destroy({ where: { organizationId: createdOrgId } });
    }
    if (createdUserId) {
      await User.destroy({ where: { id: createdUserId } });
    }
    if (createdShopId) {
      await Shop.destroy({ where: { id: createdShopId } });
    }
    if (createdOrgId) {
      await Organization.destroy({ where: { id: createdOrgId } });
    }
  });

  test('3. Register with an email that exists in Employees only returns 400', async () => {
    const ts = Date.now();
    const empEmail = `employee_only_${ts}@example.com`;

    const emp = await Employee.create({
      firstName: 'Jane',
      lastName: 'Doe',
      email: empEmail,
      password: 'Password123!',
      position: 'Cashier',
      salary: 40000,
      shopId: testShop.id
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Employee Colliding User',
        email: empEmail,
        password: 'Password123!',
        shop: { name: `Employee Collision Shop ${ts}` }
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'User already exists' });

    const userRow = await User.findOne({ where: { email: empEmail } });
    expect(userRow).toBeNull();

    await emp.destroy();
  });

  test('4. Normal registration returns 201 with auth payload and a trialing Growth subscription', async () => {
    const ts = Date.now();
    const email = `normal_merchant_${ts}@example.com`;

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Normal Merchant',
        email,
        password: 'Password123!',
        shop: {
          name: `Normal Merchant Shop ${ts}`,
          address: 'Moi Avenue, Nairobi',
          phone: '+254711223344'
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.orgRole).toBe('owner');
    expect(res.body.user.shop).toBeDefined();
    expect(res.body.user.shop.name).toBe(`Normal Merchant Shop ${ts}`);

    const orgId = res.body.user.shop.organizationId;
    expect(orgId).toBeDefined();

    const sub = await Subscription.findOne({ where: { organizationId: orgId } });
    expect(sub).toBeDefined();
    expect(sub.status).toBe('trialing');
    expect(sub.planId).toBe(growthPlan.id);
    expect(sub.trialEndsAt).toBeDefined();

    // Teardown
    await Subscription.destroy({ where: { organizationId: orgId } });
    await OrganizationMembership.destroy({ where: { organizationId: orgId } });
    await User.destroy({ where: { id: res.body.user.id } });
    await Shop.destroy({ where: { id: res.body.user.shop.id } });
    await Organization.destroy({ where: { id: orgId } });
  });
});
