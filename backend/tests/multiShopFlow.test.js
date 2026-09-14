const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  ActivityLog,
  User,
  SystemSettings,
  Subscription,
  Plan
} = require('../src/models');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(
    payload,
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: process.env.JWT_EXPIRES_IN || '2h'
    }
  );
}

describe('Multi-Shop Flow Integration Tests (FINDING-12 Consumer Slice)', () => {
  let orgA, orgB;
  let shopA1, shopB1;
  let ownerUser, adminUser, memberUser;
  let ownerMembership, adminMembership, memberMembership;
  let ownerToken, adminToken, memberToken;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Clean up test data if present
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;').catch(() => {});
    try {
      await User.destroy({ where: { email: ['msf_owner@test.com', 'msf_admin@test.com', 'msf_member@test.com'] } });
      const existingOrgs = await Organization.findAll({ where: { slug: ['msf-org-alpha', 'msf-org-beta'] } });
      const existingOrgIds = existingOrgs.map(o => o.id);
      if (existingOrgIds.length > 0) {
        await Subscription.destroy({ where: { organizationId: existingOrgIds } });
      }
      await Organization.destroy({ where: { slug: ['msf-org-alpha', 'msf-org-beta'] } });
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
    }

    // 1. Create test organizations
    orgA = await Organization.create({
      name: 'MSF Org Alpha',
      slug: 'msf-org-alpha',
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: 'MSF Org Beta',
      slug: 'msf-org-beta',
      status: 'active',
      currency: 'USD'
    });

    const gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
    if (gfPlan) {
      await Subscription.create({
        organizationId: orgA.id,
        planId: gfPlan.id,
        status: 'active',
        billingCycle: 'yearly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31 23:59:59'),
        trialEndsAt: null
      });
      await Subscription.create({
        organizationId: orgB.id,
        planId: gfPlan.id,
        status: 'active',
        billingCycle: 'yearly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31 23:59:59'),
        trialEndsAt: null
      });
    }

    // 2. Create existing shops under orgs
    shopA1 = await Shop.create({
      name: 'MSF Shop Alpha One',
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: 'MSF Shop Beta One',
      organizationId: orgB.id,
      active: true
    });

    // 3. Create test users
    ownerUser = await User.create({
      name: 'MSF Owner',
      email: 'msf_owner@test.com',
      password: 'password123',
      role: 'admin',
      shopId: shopA1.id,
      active: true
    });

    adminUser = await User.create({
      name: 'MSF Admin',
      email: 'msf_admin@test.com',
      password: 'password123',
      role: 'admin',
      shopId: shopA1.id,
      active: true
    });

    memberUser = await User.create({
      name: 'MSF Member',
      email: 'msf_member@test.com',
      password: 'password123',
      role: 'cashier',
      shopId: shopA1.id,
      active: true
    });

    // 4. Create Organization Memberships
    ownerMembership = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    adminMembership = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: adminUser.id,
      orgRole: 'admin',
      status: 'active'
    });

    memberMembership = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: memberUser.id,
      orgRole: 'member',
      status: 'active'
    });

    // Grant member access to shopA1
    await ShopAccess.create({
      membershipId: memberMembership.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // 5. Generate tokens
    ownerToken = tokenFor({
      id: ownerUser.id,
      role: ownerUser.role,
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    adminToken = tokenFor({
      id: adminUser.id,
      role: adminUser.role,
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    memberToken = tokenFor({
      id: memberUser.id,
      role: memberUser.role,
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });
  });

  afterAll(async () => {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;').catch(() => {});
    try {
      if (orgA?.id || orgB?.id) {
        const orgIds = [orgA?.id, orgB?.id].filter(Boolean);
        const shops = await Shop.findAll({ where: { organizationId: orgIds } });
        const shopIds = shops.map(s => s.id);
        if (shopIds.length > 0) {
          await ActivityLog.destroy({ where: { shopId: shopIds } });
          await SystemSettings.destroy({ where: { shopId: shopIds } });
          await ShopAccess.destroy({ where: { shopId: shopIds } });
          await Shop.destroy({ where: { id: shopIds } });
        }
        await OrganizationMembership.destroy({ where: { organizationId: orgIds } });
        await Organization.destroy({ where: { id: orgIds } });
      }
      if (ownerUser?.id || adminUser?.id || memberUser?.id) {
        await User.destroy({ where: { id: [ownerUser?.id, adminUser?.id, memberUser?.id].filter(Boolean) } });
      }
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
    }
  });

  describe('Item 2 — Shop creation as owner', () => {
    let createdShopId;

    it('creates shop with access: null, ZERO new ShopAccess rows, and ActivityLog entry', async () => {
      const countBefore = await ShopAccess.count();

      const res = await request(app)
        .post('/api/shop')
        .set('Authorization', ownerToken)
        .send({
          name: 'Owner Created Shop',
          address: 'Kenyatta Ave, Nairobi',
          phone: '+254700111222',
          kraPin: 'P050011223Z',
          registrationNumber: 'REG-OWNER-01'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Shop created successfully');
      expect(res.body.shop).toBeDefined();
      expect(res.body.shop.name).toBe('Owner Created Shop');
      expect(res.body.shop.organizationId).toBe(orgA.id);
      expect(res.body.access).toBeNull(); // Owner bypasses ShopAccess by design

      createdShopId = res.body.shop.id;

      // Verify ZERO new ShopAccess rows were created
      const countAfter = await ShopAccess.count();
      expect(countAfter).toBe(countBefore);

      // Verify ActivityLog entry was written with action SHOP_CREATED and shopId = createdShopId
      const log = await ActivityLog.findOne({
        where: {
          action: 'SHOP_CREATED',
          shopId: createdShopId
        }
      });
      expect(log).not.toBeNull();
      expect(log.entity).toBe('Shop');
      expect(log.entityId).toBe(String(createdShopId));
      expect(log.userId).toBe(ownerUser.id);

      // Verify SystemSettings was created
      const settings = await SystemSettings.findOne({ where: { shopId: createdShopId } });
      expect(settings).not.toBeNull();
      expect(settings.defaultCurrency).toBe('KES');
    });
  });

  describe('Item 3 — Shop creation as admin', () => {
    let createdShopId;

    it('creates shop with real ShopAccess row and exactly ONE new ShopAccess row', async () => {
      const countBefore = await ShopAccess.count();

      const res = await request(app)
        .post('/api/shop')
        .set('Authorization', adminToken)
        .send({
          name: 'Admin Created Shop',
          address: 'Moi Ave, Nairobi',
          phone: '+254700333444'
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Shop created successfully');
      expect(res.body.shop).toBeDefined();
      expect(res.body.access).toBeDefined();
      expect(res.body.access.membershipId).toBe(adminMembership.id);
      expect(res.body.access.shopId).toBe(res.body.shop.id);
      expect(res.body.access.isDefault).toBe(false);

      createdShopId = res.body.shop.id;

      // Verify exactly ONE new ShopAccess row was created
      const countAfter = await ShopAccess.count();
      expect(countAfter).toBe(countBefore + 1);

      // Verify ActivityLog entry was written
      const log = await ActivityLog.findOne({
        where: {
          action: 'SHOP_CREATED',
          shopId: createdShopId
        }
      });
      expect(log).not.toBeNull();
      expect(log.action).toBe('SHOP_CREATED');
      expect(log.userId).toBe(adminUser.id);
    });
  });

  describe('Item 4 — Shop creation as member', () => {
    it('returns 403 and writes ZERO Shop, ShopAccess, or ActivityLog rows', async () => {
      const shopCountBefore = await Shop.count();
      const accessCountBefore = await ShopAccess.count();
      const logCountBefore = await ActivityLog.count();

      const res = await request(app)
        .post('/api/shop')
        .set('Authorization', memberToken)
        .send({
          name: 'Unauthorized Member Shop'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Only organization owners and admins/i);

      // Verify zero rows written
      const shopCountAfter = await Shop.count();
      const accessCountAfter = await ShopAccess.count();
      const logCountAfter = await ActivityLog.count();

      expect(shopCountAfter).toBe(shopCountBefore);
      expect(accessCountAfter).toBe(accessCountBefore);
      expect(logCountAfter).toBe(logCountBefore);
    });
  });

  describe('Item 5 — Switch-shop as owner with NO ShopAccess row', () => {
    it('succeeds (200) with new token and proves ZERO database writes', async () => {
      // Find a shop under orgA where owner has NO ShopAccess row (owner has no ShopAccess rows anywhere)
      const targetShop = await Shop.findOne({ where: { name: 'Admin Created Shop' } });
      expect(targetShop).not.toBeNull();

      // Confirm owner has no ShopAccess row for this shop
      const existingAccess = await ShopAccess.findOne({
        where: { membershipId: ownerMembership.id, shopId: targetShop.id }
      });
      expect(existingAccess).toBeNull();

      const accessCountBefore = await ShopAccess.count();

      const res = await request(app)
        .post('/api/auth/switch-shop')
        .set('Authorization', ownerToken)
        .send({ shopId: targetShop.id });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Switched active shop successfully');
      expect(res.body.token).toBeDefined();
      expect(res.body.user.shopId).toBe(targetShop.id);
      expect(res.body.shop.id).toBe(targetShop.id);

      // Hard check: query ShopAccess table count before and immediately after the call — MUST be identical
      const accessCountAfter = await ShopAccess.count();
      expect(accessCountAfter).toBe(accessCountBefore);
    });
  });

  describe('Item 6 — Switch-shop as admin/member to shop with ShopAccess', () => {
    it('succeeds (200) and proves ZERO database writes', async () => {
      // member has ShopAccess for shopA1
      const accessCountBefore = await ShopAccess.count();

      const res = await request(app)
        .post('/api/auth/switch-shop')
        .set('Authorization', memberToken)
        .send({ shopId: shopA1.id });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Switched active shop successfully');
      expect(res.body.token).toBeDefined();
      expect(res.body.user.shopId).toBe(shopA1.id);
      expect(res.body.shop.id).toBe(shopA1.id);

      const accessCountAfter = await ShopAccess.count();
      expect(accessCountAfter).toBe(accessCountBefore);
    });
  });

  describe('Item 7 — Switch-shop as member to shop without ShopAccess', () => {
    it('returns 403 and proves ZERO database writes', async () => {
      // Target the 'Admin Created Shop' where member has NO ShopAccess
      const targetShop = await Shop.findOne({ where: { name: 'Admin Created Shop' } });
      expect(targetShop).not.toBeNull();

      const accessCountBefore = await ShopAccess.count();

      const res = await request(app)
        .post('/api/auth/switch-shop')
        .set('Authorization', memberToken)
        .send({ shopId: targetShop.id });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Access denied/i);

      const accessCountAfter = await ShopAccess.count();
      expect(accessCountAfter).toBe(accessCountBefore);
    });
  });

  describe('Item 8 — Switch-shop targeting shop in DIFFERENT organization', () => {
    it('returns 404 (not 403) to avoid leaking shop existence', async () => {
      // shopB1 belongs to orgB, but ownerToken belongs to orgA
      const res = await request(app)
        .post('/api/auth/switch-shop')
        .set('Authorization', ownerToken)
        .send({ shopId: shopB1.id });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Shop not found/i);
    });
  });

  describe('Item 9 — Decode token returned by switch-shop', () => {
    it('matches login token claim shape and expiry convention exactly', async () => {
      const targetShop = await Shop.findOne({ where: { name: 'Admin Created Shop' } });

      const res = await request(app)
        .post('/api/auth/switch-shop')
        .set('Authorization', ownerToken)
        .send({ shopId: targetShop.id });

      expect(res.status).toBe(200);
      const switchedToken = res.body.token;

      const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
      const decoded = jwt.verify(switchedToken, publicKey, { algorithms: ['RS256'] });

      expect(decoded.id).toBe(ownerUser.id);
      expect(decoded.role).toBe(ownerUser.role);
      expect(decoded.shopId).toBe(targetShop.id);
      expect(decoded.organizationId).toBe(orgA.id);
      expect(decoded.isEmployee).toBe(false);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();

      // Check expiry matches process.env.JWT_EXPIRES_IN convention (24h = 86400s or 2h = 7200s)
      const diffSeconds = decoded.exp - decoded.iat;
      const expectedExpirySeconds = (process.env.JWT_EXPIRES_IN === '24h') ? 86400 : 7200;
      expect(Math.abs(diffSeconds - expectedExpirySeconds)).toBeLessThanOrEqual(10);
    });
  });

  describe('Item 10 — GET /api/shop/accessible for owner vs member', () => {
    it('lists all org shops for owner, and only ShopAccess-granted shops for member', async () => {
      // 1. Owner call
      const ownerRes = await request(app)
        .get('/api/shop/accessible')
        .set('Authorization', ownerToken);

      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.organizationId).toBe(orgA.id);
      expect(ownerRes.body.currentShopId).toBe(shopA1.id);
      expect(Array.isArray(ownerRes.body.shops)).toBe(true);

      // OrgA has at least 3 shops now (shopA1, Owner Created Shop, Admin Created Shop)
      const ownerShopIds = ownerRes.body.shops.map(s => s.id);
      expect(ownerShopIds).toContain(shopA1.id);
      expect(ownerShopIds.length).toBeGreaterThanOrEqual(3);

      // Check current shop flag
      const currentShop = ownerRes.body.shops.find(s => s.id === shopA1.id);
      expect(currentShop.isCurrent).toBe(true);

      // 2. Member call (member only has ShopAccess to shopA1)
      const memberRes = await request(app)
        .get('/api/shop/accessible')
        .set('Authorization', memberToken);

      expect(memberRes.status).toBe(200);
      expect(memberRes.body.organizationId).toBe(orgA.id);
      expect(memberRes.body.shops.length).toBe(1);
      expect(memberRes.body.shops[0].id).toBe(shopA1.id);
      expect(memberRes.body.shops[0].isCurrent).toBe(true);
    });
  });
});
