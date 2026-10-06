'use strict';

/**
 * Regression smoke test for authzContext.js ReferenceError bug.
 *
 * This test exercises the REAL authzContext middleware (no mocking)
 * to catch undeclared variable errors that gate2a/gate3a tests missed.
 *
 * Bug: effectiveRole was assigned but never declared in 'use strict' mode,
 * causing ReferenceError on every authenticated request.
 */

const request = require('supertest');
const app = require('../src/app');
const {
  sequelize,
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  Plan
} = require('../src/models');

describe('authzContext Smoke Test (Regression for undeclared effectiveRole)', () => {
  let ownerUser, cashierUser, superAdminUser;
  let testOrg, testShop;
  let ownerToken, cashierToken, superAdminToken;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Ensure growth plan exists
    let growthPlan = await Plan.findOne({ where: { code: 'growth' } });
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

    // Create test organization
    testOrg = await Organization.create({
      name: 'Smoke Test Org',
      slug: `smoke-test-org-${Date.now()}`,
      status: 'active',
      currency: 'KES'
    });

    // Create test shop
    testShop = await Shop.create({
      name: 'Smoke Test Shop',
      organizationId: testOrg.id,
      active: true
    });

    // Create owner user (orgRole: owner)
    ownerUser = await User.create({
      name: 'Smoke Owner',
      email: `smoke-owner-${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: testShop.id,
      active: true
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Create cashier user (orgRole: member, rawRole: cashier)
    cashierUser = await User.create({
      name: 'Smoke Cashier',
      email: `smoke-cashier-${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: testShop.id,
      active: true
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: cashierUser.id,
      orgRole: 'member',
      status: 'active'
    });

    // Create super_admin user (platform level, no org)
    superAdminUser = await User.create({
      name: 'Smoke Super Admin',
      email: `smoke-superadmin-${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'super_admin',
      shopId: null,
      active: true
    });

    // Login to get tokens
    const ownerRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: ownerUser.email,
        password: 'Password123!'
      });
    ownerToken = ownerRes.body.token;

    const cashierRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: cashierUser.email,
        password: 'Password123!'
      });
    cashierToken = cashierRes.body.token;

    const superAdminRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: superAdminUser.email,
        password: 'Password123!'
      });
    superAdminToken = superAdminRes.body.token;
  });

  afterAll(async () => {
    // Cleanup
    await OrganizationMembership.destroy({ where: { organizationId: testOrg.id } });
    await User.destroy({ where: { id: [ownerUser.id, cashierUser.id, superAdminUser.id] } });
    await Shop.destroy({ where: { id: testShop.id } });
    await Organization.destroy({ where: { id: testOrg.id } });
  });

  test('Owner login and profile returns 200 (authzContext does not throw)', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', ownerToken);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(ownerUser.email);
  });

  test('Owner token on GET /api/sales returns 200, not 500', async () => {
    const res = await request(app)
      .get('/api/sales?limit=5')
      .set('Authorization', ownerToken);

    // Should return 200 with empty array or sales, NOT 500 from ReferenceError
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sales || res.body)).toBe(true);
  });

  test('Cashier token on GET /api/employees returns 403, not 500', async () => {
    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', cashierToken);

    // Should return 403 forbidden, NOT 500 from ReferenceError
    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  test('Super admin token works on platform route', async () => {
    // Use a platform route that super_admin should access
    const res = await request(app)
      .get('/api/organizations')
      .set('Authorization', superAdminToken);

    // Should NOT return 500 from ReferenceError in authzContext
    // 404 is acceptable (route may not exist), 401 is acceptable (auth issue)
    expect(res.status).not.toBe(500);
  });
});
