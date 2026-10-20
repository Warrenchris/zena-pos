'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const authzContextCacheService = require('../src/services/authzContextCacheService');
const shopAuth = require('../src/middleware/shopAuth');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Product,
  SystemSettings
} = require('../src/models');

function signToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const jti = payload.jti || crypto.randomUUID();
  const iat = payload.iat || Math.floor(Date.now() / 1000);
  return 'Bearer ' + jwt.sign({ jti, iat, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Inactive Shop Authorization and Cache Invalidation', () => {
  let orgA;
  let orgB;
  let shopA1;
  let shopA2;
  let shopA3;
  let shopA4;
  let shopB1;
  let productA1;
  let productA2;
  let ownerA;
  let cashierA;
  let managerA;
  let employeeA;
  let ownerB;
  let cashierB;

  let ownerAToken;
  let cashierAToken;
  let managerAToken;
  let employeeAToken;
  let deactivatedClaimToken;
  let cashierBToken;
  let cashierShopA1Token;

  const originalCacheEnv = process.env.AUTHZ_CONTEXT_CACHE_ENABLED;

  beforeAll(async () => {
    await sequelize.authenticate();

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Organization A
    orgA = await Organization.create({
      name: `Org A ${suffix}`,
      slug: `org-a-${suffix}`,
      status: 'active',
      currency: 'KES'
    });

    shopA1 = await Shop.create({
      name: `Shop A1 Active ${suffix}`,
      address: '101 Street',
      phone: '+254700000001',
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 Target ${suffix}`,
      address: '102 Street',
      phone: '+254700000002',
      organizationId: orgA.id,
      active: true
    });

    shopA3 = await Shop.create({
      name: `Shop A3 Active NoAccess ${suffix}`,
      address: '103 Street',
      phone: '+254700000004',
      organizationId: orgA.id,
      active: true
    });

    shopA4 = await Shop.create({
      name: `Shop A4 Inactive NoAccess ${suffix}`,
      address: '104 Street',
      phone: '+254700000005',
      organizationId: orgA.id,
      active: false
    });

    productA1 = await Product.create({
      name: `Product A1 ${suffix}`,
      sku: `SKU-A1-${suffix}`,
      price: 100,
      cost: 50,
      stockQuantity: 10,
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    productA2 = await Product.create({
      name: `Product A2 ${suffix}`,
      sku: `SKU-A2-${suffix}`,
      price: 200,
      cost: 100,
      stockQuantity: 20,
      shopId: shopA2.id,
      organizationId: orgA.id
    });

    await SystemSettings.create({
      shopId: shopA2.id,
      systemName: `Settings Shop A2 ${suffix}`
    });

    ownerA = await User.create({
      name: 'Owner A',
      email: `owner_a_${suffix}@test.local`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerA.id,
      orgRole: 'owner',
      status: 'active'
    });

    cashierA = await User.create({
      name: 'Cashier A',
      email: `cashier_a_${suffix}@test.local`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    const cashierAMem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: cashierA.id,
      orgRole: 'member',
      status: 'active'
    });

    // Cashier has access to both shopA1 and shopA2
    await ShopAccess.create({ membershipId: cashierAMem.id, shopId: shopA1.id, isDefault: true });
    await ShopAccess.create({ membershipId: cashierAMem.id, shopId: shopA2.id, isDefault: false });

    managerA = await User.create({
      name: 'Manager A',
      email: `manager_a_${suffix}@test.local`,
      password: 'Password123!',
      role: 'manager',
      shopId: shopA2.id,
      organizationId: orgA.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    const managerAMem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: managerA.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({ membershipId: managerAMem.id, shopId: shopA2.id, isDefault: true });

    employeeA = await Employee.create({
      firstName: 'Employee',
      lastName: 'A',
      email: `employee_a_${suffix}@test.local`,
      password: 'Password123!',
      position: 'Cashier',
      status: 'active',
      salary: 30000,
      shopId: shopA2.id,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: employeeA.id,
      orgRole: 'member',
      status: 'active'
    });

    // Organization B (to verify tenant isolation in cache purge)
    orgB = await Organization.create({
      name: `Org B ${suffix}`,
      slug: `org-b-${suffix}`,
      status: 'active',
      currency: 'KES'
    });

    shopB1 = await Shop.create({
      name: `Shop B1 Active ${suffix}`,
      address: '201 Street',
      phone: '+254700000003',
      organizationId: orgB.id,
      active: true
    });

    ownerB = await User.create({
      name: 'Owner B',
      email: `owner_b_${suffix}@test.local`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: ownerB.id,
      orgRole: 'owner',
      status: 'active'
    });

    cashierB = await User.create({
      name: 'Cashier B',
      email: `cashier_b_${suffix}@test.local`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    const cashierBMem = await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: cashierB.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({ membershipId: cashierBMem.id, shopId: shopB1.id, isDefault: true });

    // Mint tokens
    ownerAToken = signToken({
      id: ownerA.id,
      role: 'admin',
      orgRole: 'owner',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    cashierAToken = signToken({
      id: cashierA.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    managerAToken = signToken({
      id: managerA.id,
      role: 'manager',
      orgRole: 'member',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    employeeAToken = signToken({
      id: employeeA.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isEmployee: true,
      authzVersion: 1
    });

    deactivatedClaimToken = signToken({
      id: cashierA.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    cashierBToken = signToken({
      id: cashierB.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shopB1.id,
      organizationId: orgB.id,
      isEmployee: false,
      authzVersion: 1
    });

    cashierShopA1Token = signToken({
      id: cashierA.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });
  });

  afterAll(async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = originalCacheEnv;

    if (productA1) await Product.destroy({ where: { id: productA1.id } }).catch(() => {});
    if (productA2) await Product.destroy({ where: { id: productA2.id } }).catch(() => {});
    if (cashierA) await User.destroy({ where: { id: cashierA.id } }).catch(() => {});
    if (managerA) await User.destroy({ where: { id: managerA.id } }).catch(() => {});
    if (ownerA) await User.destroy({ where: { id: ownerA.id } }).catch(() => {});
    if (employeeA) await Employee.destroy({ where: { id: employeeA.id } }).catch(() => {});
    if (cashierB) await User.destroy({ where: { id: cashierB.id } }).catch(() => {});
    if (ownerB) await User.destroy({ where: { id: ownerB.id } }).catch(() => {});
    if (shopA1) await Shop.destroy({ where: { id: shopA1.id } }).catch(() => {});
    if (shopA2) await Shop.destroy({ where: { id: shopA2.id } }).catch(() => {});
    if (shopB1) await Shop.destroy({ where: { id: shopB1.id } }).catch(() => {});
    if (orgA) await Organization.destroy({ where: { id: orgA.id } }).catch(() => {});
    if (orgB) await Organization.destroy({ where: { id: orgB.id } }).catch(() => {});
  });

  describe('Deactivation with Cache OFF (AUTHZ_CONTEXT_CACHE_ENABLED = false)', () => {
    beforeAll(async () => {
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'false';
      await Shop.update({ active: true }, { where: { id: shopA2.id } });
    });

    it('allows access to active shop before deactivation', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', cashierAToken);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products || res.body)).toBe(true);
    });

    it('deactivation takes effect on the next request for cashier, manager, and employee', async () => {
      // Deactivate shopA2 via real PATCH endpoint
      const deactRes = await request(app)
        .patch(`/api/shops/${shopA2.id}/deactivate`)
        .set('Authorization', ownerAToken);

      expect(deactRes.status).toBe(200);
      expect(deactRes.body.shop.active).toBe(false);

      // On next request: cashier is rejected with 403 SHOP_INACTIVE
      const cashierRes = await request(app)
        .get('/api/products')
        .set('Authorization', cashierAToken);

      expect(cashierRes.status).toBe(403);
      expect(cashierRes.body.code).toBe('SHOP_INACTIVE');

      // Manager is rejected with 403 SHOP_INACTIVE
      const managerRes = await request(app)
        .get('/api/products')
        .set('Authorization', managerAToken);

      expect(managerRes.status).toBe(403);
      expect(managerRes.body.code).toBe('SHOP_INACTIVE');

      // Employee is rejected with 403 SHOP_INACTIVE
      const employeeRes = await request(app)
        .get('/api/products')
        .set('Authorization', employeeAToken);

      expect(employeeRes.status).toBe(403);
      expect(employeeRes.body.code).toBe('SHOP_INACTIVE');
    });

    it('rejects a token presenting the deactivated shopId claim', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', deactivatedClaimToken);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_INACTIVE');
    });

    it('leaves other active shops unaffected for non-owner', async () => {
      const tokenShopA1 = signToken({
        id: cashierA.id,
        role: 'cashier',
        orgRole: 'member',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', tokenShopA1);

      expect(res.status).toBe(200);
    });

    it('keeps owner unaffected: owner can view settings and reactivate shop', async () => {
      const ownerShopA2Token = signToken({
        id: ownerA.id,
        role: 'admin',
        orgRole: 'owner',
        shopId: shopA2.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      // Owner can view settings for the deactivated shop
      const settingsRes = await request(app)
        .get('/api/settings')
        .set('Authorization', ownerShopA2Token);

      expect(settingsRes.status).toBe(200);

      // Owner can reactivate the shop
      const reactRes = await request(app)
        .patch(`/api/shops/${shopA2.id}/activate`)
        .set('Authorization', ownerAToken);

      expect(reactRes.status).toBe(200);
      expect(reactRes.body.shop.active).toBe(true);

      // Reactivation restores access for non-owner
      const cashierAfterRes = await request(app)
        .get('/api/products')
        .set('Authorization', cashierAToken);

      expect(cashierAfterRes.status).toBe(200);
    });
  });

  describe('Deactivation with Cache ON (AUTHZ_CONTEXT_CACHE_ENABLED = true)', () => {
    beforeAll(async () => {
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';
      await Shop.update({ active: true }, { where: { id: shopA2.id } });
    });

    it('cache purge on deactivation deletes only target organization keys and takes effect on next request', async () => {
      if (!redisClient || redisClient.status !== 'ready') {
        return; // Skip Redis-dependent assertions if Redis is not running
      }

      // 1. Populate cache for Org A and Org B
      await request(app).get('/api/products').set('Authorization', cashierAToken);
      await request(app).get('/api/products').set('Authorization', cashierBToken);

      // Confirm keys exist in Redis for both orgs
      const orgAPattern = `authz_ctx:org:${orgA.id}:*`;
      const orgBPattern = `authz_ctx:org:${orgB.id}:*`;

      const [, keysABefore] = await redisClient.scan('0', 'MATCH', orgAPattern, 'COUNT', 100);
      const [, keysBBefore] = await redisClient.scan('0', 'MATCH', orgBPattern, 'COUNT', 100);

      expect(keysABefore.length).toBeGreaterThan(0);
      expect(keysBBefore.length).toBeGreaterThan(0);

      // 2. Deactivate shopA2
      const deactRes = await request(app)
        .patch(`/api/shops/${shopA2.id}/deactivate`)
        .set('Authorization', ownerAToken);

      expect(deactRes.status).toBe(200);

      // 3. Cache purge verification: Org A keys removed, Org B keys untouched
      const [, keysAAfter] = await redisClient.scan('0', 'MATCH', orgAPattern, 'COUNT', 100);
      const [, keysBAfter] = await redisClient.scan('0', 'MATCH', orgBPattern, 'COUNT', 100);

      expect(keysAAfter.length).toBe(0);
      expect(keysBAfter.length).toBe(keysBBefore.length);

      // 4. Next request takes effect immediately: cashier gets 403 SHOP_INACTIVE
      const cashierNextRes = await request(app)
        .get('/api/products')
        .set('Authorization', cashierAToken);

      expect(cashierNextRes.status).toBe(403);
      expect(cashierNextRes.body.code).toBe('SHOP_INACTIVE');

      // Subsequent cached request also returns 403 SHOP_INACTIVE
      const cashierCachedRes = await request(app)
        .get('/api/products')
        .set('Authorization', cashierAToken);

      expect(cashierCachedRes.status).toBe(403);
      expect(cashierCachedRes.body.code).toBe('SHOP_INACTIVE');

      // 5. Reactivate shop restores access and purges cache
      const reactRes = await request(app)
        .patch(`/api/shops/${shopA2.id}/activate`)
        .set('Authorization', ownerAToken);

      expect(reactRes.status).toBe(200);

      const cashierRestoredRes = await request(app)
        .get('/api/products')
        .set('Authorization', cashierAToken);

      expect(cashierRestoredRes.status).toBe(200);
    });
  });

  describe('shopAuth middleware rejection of inactive shop', () => {
    it('rejects an inactive shop with 403 SHOP_INACTIVE for non-owner', async () => {
      // Temporarily deactivate shopA2
      await Shop.update({ active: false }, { where: { id: shopA2.id } });

      const req = {
        shopId: shopA2.id,
        user: { id: cashierA.id, orgRole: 'member', role: 'cashier', shopId: shopA2.id },
        authz: {
          tenant: { isOwner: false },
          scope: {
            hasShopAccess: (id) => Number(id) !== Number(shopA2.id),
            isInactiveAccessibleShop: (id) => Number(id) === Number(shopA2.id)
          }
        }
      };

      const res = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        }
      };

      let nextCalled = false;
      await shopAuth(req, res, () => { nextCalled = true; });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('SHOP_INACTIVE');

      // Reset to active
      await Shop.update({ active: true }, { where: { id: shopA2.id } });
    });
  });

  describe('authzContextCacheService.invalidateOrgActorContexts unit tests', () => {
    it('purges only the specified organization keys and leaves other org keys untouched', async () => {
      if (!redisClient || redisClient.status !== 'ready') return;

      const targetOrgId = 98765;
      const otherOrgId = 98766;

      // Seed Redis with keys for both orgs
      await redisClient.setex(`authz_ctx:org:${targetOrgId}:u:1:v:1`, 60, JSON.stringify({ test: 1 }));
      await redisClient.setex(`authz_ctx:org:${targetOrgId}:u:2:v:1`, 60, JSON.stringify({ test: 2 }));
      await redisClient.setex(`authz_ctx:org:${targetOrgId}:e:3:v:1`, 60, JSON.stringify({ test: 3 }));
      await redisClient.setex(`authz_ctx:org:${otherOrgId}:u:1:v:1`, 60, JSON.stringify({ test: 4 }));

      const deletedCount = await authzContextCacheService.invalidateOrgActorContexts(targetOrgId);
      expect(deletedCount).toBe(3);

      const targetVal = await redisClient.get(`authz_ctx:org:${targetOrgId}:u:1:v:1`);
      const otherVal = await redisClient.get(`authz_ctx:org:${otherOrgId}:u:1:v:1`);

      expect(targetVal).toBeNull();
      expect(otherVal).not.toBeNull();

      // Clean up otherOrg key
      await redisClient.del(`authz_ctx:org:${otherOrgId}:u:1:v:1`);
    });

    it('fails open when Redis scan throws an error', async () => {
      const scanSpy = jest.spyOn(redisClient, 'scan').mockRejectedValueOnce(new Error('Redis connection failed'));

      // Should not throw
      const result = await authzContextCacheService.invalidateOrgActorContexts(99999);
      expect(result).toBe(0);

      scanSpy.mockRestore();
    });
  });
  describe('Strict SHOP_INACTIVE vs SHOP_ACCESS_DENIED scoping', () => {
    beforeEach(async () => {
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'false';
      if (redisClient && redisClient.status === 'ready') {
        await authzContextCacheService.invalidateOrgActorContexts(orgA.id);
      }
    });

    afterAll(async () => {
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = originalCacheEnv;
      await Shop.update({ active: true }, { where: { id: shopA2.id } });
      if (redisClient && redisClient.status === 'ready') {
        await authzContextCacheService.invalidateOrgActorContexts(orgA.id);
      }
    });

    it('returns 403 SHOP_INACTIVE when user has access to shop but shop is inactive', async () => {
      await Shop.update({ active: false }, { where: { id: shopA2.id } });
      const res = await request(app)
        .get(`/api/products?shopId=${shopA2.id}`)
        .set('Authorization', cashierShopA1Token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_INACTIVE');
    });

    it('returns 403 SHOP_ACCESS_DENIED when user has no access to an active shop in the same org', async () => {
      const res = await request(app)
        .get(`/api/products?shopId=${shopA3.id}`)
        .set('Authorization', cashierShopA1Token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    it('returns 403 SHOP_ACCESS_DENIED (not SHOP_INACTIVE) when user has no access to an inactive shop', async () => {
      const res = await request(app)
        .get(`/api/products?shopId=${shopA4.id}`)
        .set('Authorization', cashierShopA1Token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    it('preserves same scoping behavior with actor context caching enabled', async () => {
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';
      try {
        if (redisClient && redisClient.status === 'ready') {
          await authzContextCacheService.invalidateOrgActorContexts(orgA.id);
        }

        // Accessing inactive accessible shop -> SHOP_INACTIVE
        const inactiveRes = await request(app)
          .get(`/api/products?shopId=${shopA2.id}`)
          .set('Authorization', cashierShopA1Token);
        expect(inactiveRes.status).toBe(403);
        expect(inactiveRes.body.code).toBe('SHOP_INACTIVE');

        // Accessing active inaccessible shop -> SHOP_ACCESS_DENIED
        const activeNoAccessRes = await request(app)
          .get(`/api/products?shopId=${shopA3.id}`)
          .set('Authorization', cashierShopA1Token);
        expect(activeNoAccessRes.status).toBe(403);
        expect(activeNoAccessRes.body.code).toBe('SHOP_ACCESS_DENIED');

        // Accessing inactive inaccessible shop -> SHOP_ACCESS_DENIED (no leak)
        const inactiveNoAccessRes = await request(app)
          .get(`/api/products?shopId=${shopA4.id}`)
          .set('Authorization', cashierShopA1Token);
        expect(inactiveNoAccessRes.status).toBe(403);
        expect(inactiveNoAccessRes.body.code).toBe('SHOP_ACCESS_DENIED');
      } finally {
        process.env.AUTHZ_CONTEXT_CACHE_ENABLED = originalCacheEnv;
      }
    });
  });
});
