const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Product,
  Inventory,
  Sale,
  User,
  Subscription,
  Plan
} = require('../src/models');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

function tokenFor(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8');

  return 'Bearer ' + jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '1h'
  });
}

describe('Organization Insights Endpoints (FINDING-12 Phase 4)', () => {
  let org;
  let shopA, shopB;
  let ownerUser, adminUser, memberUser;
  let ownerToken, adminToken, memberToken;
  let sharedProduct;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Create Org
    org = await Organization.create({
      name: 'Jest Test Corp',
      slug: 'jest-corp-' + Date.now(),
      currency: 'KES',
      status: 'active'
    });

    const gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
    if (gfPlan) {
      await Subscription.create({
        organizationId: org.id,
        planId: gfPlan.id,
        status: 'active',
        billingCycle: 'yearly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31 23:59:59'),
        trialEndsAt: null
      });
    }

    // Create 2 Shops
    shopA = await Shop.create({
      name: 'Jest Shop Alpha',
      organizationId: org.id,
      active: true
    });
    shopB = await Shop.create({
      name: 'Jest Shop Beta',
      organizationId: org.id,
      active: true
    });

    // Create Users
    ownerUser = await User.create({
      name: 'Owner User',
      username: 'owner_' + Date.now(),
      email: `owner_${Date.now()}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id
    });

    adminUser = await User.create({
      name: 'Admin User',
      username: 'admin_' + Date.now(),
      email: `admin_${Date.now()}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id
    });

    memberUser = await User.create({
      name: 'Member User',
      username: 'member_' + Date.now(),
      email: `member_${Date.now()}@test.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA.id
    });

    // Memberships
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    const adminMem = await OrganizationMembership.create({
      organizationId: org.id,
      userId: adminUser.id,
      orgRole: 'admin',
      status: 'active'
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: memberUser.id,
      orgRole: 'member',
      status: 'active'
    });

    // Admin has ShopAccess ONLY to shopA
    await ShopAccess.create({
      membershipId: adminMem.id,
      shopId: shopA.id
    });

    // Tokens
    ownerToken = tokenFor({
      id: ownerUser.id,
      organizationId: org.id,
      shopId: shopA.id,
      role: 'admin'
    });

    adminToken = tokenFor({
      id: adminUser.id,
      organizationId: org.id,
      shopId: shopA.id,
      role: 'admin'
    });

    memberToken = tokenFor({
      id: memberUser.id,
      organizationId: org.id,
      shopId: shopA.id,
      role: 'cashier'
    });

    // Shared Product
    sharedProduct = await Product.create({
      organizationId: org.id,
      name: 'Jest Shared Item',
      sku: 'JEST-SKU-' + Date.now(),
      price: 100,
      cost: 50,
      shopId: shopA.id,
      active: true
    });

    // Inventory: shopA depleted (stock 0, reorder 10), shopB surplus (stock 40, reorder 10)
    await Inventory.create({
      shopId: shopA.id,
      productId: sharedProduct.id,
      stockQuantity: 0,
      reorderPoint: 10
    });
    await Inventory.create({
      shopId: shopB.id,
      productId: sharedProduct.id,
      stockQuantity: 40,
      reorderPoint: 10
    });

    // Sales in both shops
    const now = new Date();
    await Sale.create({
      shopId: shopA.id,
      total: 3000,
      paymentAmount: 3000,
      saleStatus: 'completed',
      createdAt: now
    });
    await Sale.create({
      shopId: shopB.id,
      total: 2000,
      paymentAmount: 2000,
      saleStatus: 'completed',
      createdAt: now
    });
  });

  afterAll(async () => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;').catch(() => {});
    try {
      if (sharedProduct) {
        await Inventory.destroy({ where: { productId: sharedProduct.id } }).catch(() => {});
        await Product.destroy({ where: { id: sharedProduct.id } }).catch(() => {});
      }
      if (shopA || shopB) {
        const shopIds = [shopA?.id, shopB?.id].filter(Boolean);
        await Sale.destroy({ where: { shopId: shopIds } }).catch(() => {});
        await ShopAccess.destroy({ where: { shopId: shopIds } }).catch(() => {});
        await Shop.destroy({ where: { id: shopIds } }).catch(() => {});
      }
      if (org) {
        await OrganizationMembership.destroy({ where: { organizationId: org.id } }).catch(() => {});
        await Organization.destroy({ where: { id: org.id } }).catch(() => {});
      }
      const userIds = [ownerUser?.id, adminUser?.id, memberUser?.id].filter(Boolean);
      if (userIds.length > 0) {
        await User.destroy({ where: { id: userIds } }).catch(() => {});
      }
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
    }
  });

  describe('GET /api/insights/organization/summary', () => {
    it('returns aggregated totals and branchPerformance for owner across both shops', async () => {
      const res = await request(app)
        .get('/api/insights/organization/summary')
        .set('Authorization', ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.scope.role).toBe('owner');
      expect(res.body.scope.accessibleShopsCount).toBe(2);
      expect(res.body.scope.totalOrgShopsCount).toBe(2);
      expect(res.body.metrics.totalRevenue).toBe(5000);
      expect(res.body.branchPerformance).toHaveLength(2);
      expect(res.body.branchPerformance[0].shopId).toBe(shopA.id);
      expect(res.body.branchPerformance[0].revenueSharePercentage).toBe(60);
      expect(res.body.branchPerformance[1].shopId).toBe(shopB.id);
      expect(res.body.branchPerformance[1].revenueSharePercentage).toBe(40);
    });

    it('returns only accessible shop for delegated admin', async () => {
      const res = await request(app)
        .get('/api/insights/organization/summary')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.scope.role).toBe('admin');
      expect(res.body.scope.accessibleShopsCount).toBe(1);
      expect(res.body.scope.totalOrgShopsCount).toBe(2);
      expect(res.body.metrics.totalRevenue).toBe(3000);
      expect(res.body.branchPerformance).toHaveLength(1);
      expect(res.body.branchPerformance[0].shopId).toBe(shopA.id);
    });

    it('rejects member with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/insights/organization/summary')
        .set('Authorization', memberToken);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/insights/organization/inventory-alerts', () => {
    it('returns transfer recommendations across accessible shops for owner', async () => {
      const res = await request(app)
        .get('/api/insights/organization/inventory-alerts')
        .set('Authorization', ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.alerts.length).toBeGreaterThanOrEqual(1);
      const alert = res.body.alerts.find(a => a.productId === sharedProduct.id);
      expect(alert).toBeDefined();
      expect(alert.depletedShops).toEqual(
        expect.arrayContaining([expect.objectContaining({ shopId: shopA.id })])
      );
      expect(alert.surplusShops).toEqual(
        expect.arrayContaining([expect.objectContaining({ shopId: shopB.id })])
      );
      expect(alert.transferRecommendation).toContain('transferring');
    });

    it('delegated admin only sees alerts for accessible shop without other shop details', async () => {
      const res = await request(app)
        .get('/api/insights/organization/inventory-alerts')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      const alert = res.body.alerts.find(a => a.productId === sharedProduct.id);
      expect(alert).toBeDefined();
      expect(alert.depletedShops).toEqual(
        expect.arrayContaining([expect.objectContaining({ shopId: shopA.id })])
      );
      // shopB is not accessible, so surplusShops must be empty
      expect(alert.surplusShops).toHaveLength(0);
      expect(alert.transferRecommendation).toContain('Purchase order recommended');
    });

    it('rejects member with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/insights/organization/inventory-alerts')
        .set('Authorization', memberToken);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/insights/organization/daily-sales', () => {
    it('returns consolidated daily sales for owner', async () => {
      const res = await request(app)
        .get('/api/insights/organization/daily-sales')
        .set('Authorization', ownerToken);

      expect(res.status).toBe(200);
      expect(res.body.scope.accessibleShopsCount).toBe(2);
      expect(res.body.daily_data.length).toBeGreaterThanOrEqual(1);
      const todayTotal = res.body.daily_data.reduce((acc, d) => acc + d.revenue, 0);
      expect(todayTotal).toBe(5000);
    });

    it('returns only accessible shop sales for delegated admin', async () => {
      const res = await request(app)
        .get('/api/insights/organization/daily-sales')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.scope.accessibleShopsCount).toBe(1);
      const todayTotal = res.body.daily_data.reduce((acc, d) => acc + d.revenue, 0);
      expect(todayTotal).toBe(3000);
    });

    it('rejects member with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/insights/organization/daily-sales')
        .set('Authorization', memberToken);

      expect(res.status).toBe(403);
    });
  });

  describe('Cross-organization access', () => {
    it('rejects user from different org with 403 Forbidden', async () => {
      const foreignOrg = await Organization.create({
        name: 'Foreign Org',
        slug: 'foreign-org-' + Date.now(),
        currency: 'KES',
        status: 'active'
      });

      const foreignUser = await User.create({
        name: 'Foreign User',
        username: 'foreign_' + Date.now(),
        email: `foreign_${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: shopA.id
      });

      await OrganizationMembership.create({
        organizationId: foreignOrg.id,
        userId: foreignUser.id,
        orgRole: 'owner',
        status: 'active'
      });

      // User token claims org.id, but membership is in foreignOrg.id
      const forgedToken = tokenFor({
        id: foreignUser.id,
        organizationId: org.id,
        shopId: shopA.id,
        role: 'admin'
      });

      const res = await request(app)
        .get('/api/insights/organization/summary')
        .set('Authorization', forgedToken);

      expect(res.status).toBe(403);
    });
  });
});
