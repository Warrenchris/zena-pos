'use strict';

const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Shop,
  Organization,
  Product,
  Category,
  Inventory,
  Sale,
  PendingPayment
} = require('../src/models');
const aiCacheService = require('../src/services/aiCacheService');
const backupScheduler = require('../../scripts/backup-scheduler');

function getPrivateKey() {
  return process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
}

function tokenFor(payload) {
  const privateKey = getPrivateKey();
  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 6B-07: Production Hardening Remediation Verification Suite', () => {
  let org1, org2;
  let shop1, shop2;
  let product1;
  let user1;
  let authToken;

  beforeAll(async () => {
    await sequelize.authenticate();

    const timestamp = Date.now();
    org1 = await Organization.create({
      name: `Hardening Org 1 ${timestamp}`,
      slug: `hard-org-1-${timestamp}`,
      status: 'active',
      currency: 'KES'
    });

    org2 = await Organization.create({
      name: `Hardening Org 2 ${timestamp}`,
      slug: `hard-org-2-${timestamp}`,
      status: 'active',
      currency: 'KES'
    });

    shop1 = await Shop.create({
      name: `Hardening Shop 1 ${timestamp}`,
      organizationId: org1.id,
      active: true
    });

    shop2 = await Shop.create({
      name: `Hardening Shop 2 ${timestamp}`,
      organizationId: org1.id,
      active: true
    });

    const category = await Category.create({
      name: `Hardening Cat ${timestamp}`,
      organizationId: org1.id,
      shopId: shop1.id
    });

    product1 = await Product.create({
      name: `Hardening Item ${timestamp}`,
      sku: `SKU-6B07-${timestamp}`,
      price: 150.00,
      cost: 80.00,
      categoryId: category.id,
      organizationId: org1.id,
      shopId: shop1.id,
      active: true
    });

    await Inventory.create({
      productId: product1.id,
      shopId: shop1.id,
      stockQuantity: 200,
      reorderPoint: 10
    });

    user1 = await User.create({
      name: `Hardening Admin ${timestamp}`,
      email: `admin-6b07-${timestamp}@example.com`,
      password: 'SecurePassword123!',
      role: 'admin',
      organizationId: org1.id,
      shopId: shop1.id,
      isActive: true
    });

    authToken = tokenFor({
      id: user1.id,
      role: user1.role,
      organizationId: org1.id,
      shopId: shop1.id
    });
  });

  afterAll(async () => {
    // Cleanup created test records safely in dependency order
    try {
      const sales = await Sale.findAll({ where: { shopId: [shop1.id, shop2.id] }, attributes: ['id'] });
      const saleIds = sales.map(s => s.id);
      if (saleIds.length > 0) {
        const { SaleItem, SalePayment, SaleRefund, StockMovement } = require('../src/models');
        await SaleItem.destroy({ where: { saleId: saleIds } }).catch(() => {});
        await SalePayment.destroy({ where: { saleId: saleIds } }).catch(() => {});
        await SaleRefund.destroy({ where: { saleId: saleIds } }).catch(() => {});
        await StockMovement.destroy({ where: { saleId: saleIds } }).catch(() => {});
        await Sale.destroy({ where: { id: saleIds } }).catch(() => {});
      }
      await PendingPayment.destroy({ where: { shopId: [shop1.id, shop2.id] } }).catch(() => {});
      await Inventory.destroy({ where: { shopId: [shop1.id, shop2.id] } }).catch(() => {});
      await Product.destroy({ where: { organizationId: [org1.id, org2.id] } }).catch(() => {});
      await Category.destroy({ where: { organizationId: [org1.id, org2.id] } }).catch(() => {});
      await User.destroy({ where: { id: user1.id } }).catch(() => {});
      await Shop.destroy({ where: { id: [shop1.id, shop2.id] } }).catch(() => {});
      await Organization.destroy({ where: { id: [org1.id, org2.id] } }).catch(() => {});
    } catch (e) {
      // ignore cleanup errors
    }
    backupScheduler.releaseLock();
  });

  // =========================================================================
  // 1. SEC-P1-01: M-Pesa Callback Token Timing Safety Tests
  // =========================================================================
  describe('1. SEC-P1-01: M-Pesa Constant-Time Callback Authentication', () => {
    const validToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    let checkoutRequestId;

    beforeEach(async () => {
      checkoutRequestId = `ws_CO_6B07_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      await PendingPayment.create({
        checkoutRequestId,
        orderId: `order_${checkoutRequestId}`,
        amount: 150.00,
        status: 'pending',
        paymentChannel: 'mpesa',
        shopId: shop1.id,
        saleData: {
          callbackToken: validToken,
          paymentMethod: 'mobile',
          items: [{ productId: product1.id, quantity: 1, price: 150.00 }],
          total: 150.00,
          paymentAmount: 150.00,
          userId: user1.id,
          isEmployee: false
        }
      });
    });

    it('1.1: Valid token succeeds and settles sale', async () => {
      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            ResultDesc: 'Success',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 150.00 },
                { Name: 'MpesaReceiptNumber', Value: 'RCPT_6B07_VALID' }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post(`/api/mpesa/callback?token=${validToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/processed successfully/i);

      // Verify pending payment transitioned to confirmed
      const pending = await PendingPayment.findOne({ where: { checkoutRequestId } });
      expect(pending.status).toBe('confirmed');
    });

    it('1.2: Invalid same-length token fails with 401 Unauthorized', async () => {
      // 64-char hex but differing byte
      const invalidToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f99';
      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            CallbackMetadata: { Item: [{ Name: 'Amount', Value: 150 }] }
          }
        }
      };

      const res = await request(app)
        .post(`/api/mpesa/callback?token=${invalidToken}`)
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid verification token/i);

      // Status must remain pending
      const pending = await PendingPayment.findOne({ where: { checkoutRequestId } });
      expect(pending.status).toBe('pending');
    });

    it('1.3: Differing-length token (shorter or longer) fails safely without throwing RangeError', async () => {
      const shortToken = 'a1b2c3d4';
      const longToken = validToken + 'extra_bytes_here';

      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0
          }
        }
      };

      const resShort = await request(app)
        .post(`/api/mpesa/callback?token=${shortToken}`)
        .send(payload);
      expect(resShort.status).toBe(401);
      expect(resShort.body.error).toMatch(/invalid verification token/i);

      const resLong = await request(app)
        .post(`/api/mpesa/callback?token=${longToken}`)
        .send(payload);
      expect(resLong.status).toBe(401);
      expect(resLong.body.error).toMatch(/invalid verification token/i);
    });

    it('1.4: Missing or empty query token fails with 401', async () => {
      const payload = { Body: { stkCallback: { CheckoutRequestID: checkoutRequestId, ResultCode: 0 } } };

      const resMissing = await request(app)
        .post('/api/mpesa/callback')
        .send(payload);
      expect(resMissing.status).toBe(401);
      expect(resMissing.body.error).toMatch(/missing verification token/i);

      const resEmpty = await request(app)
        .post('/api/mpesa/callback?token=')
        .send(payload);
      expect(resEmpty.status).toBe(401);
    });

    it('1.5: Replay of confirmed callback is strictly idempotent', async () => {
      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 150.00 },
                { Name: 'MpesaReceiptNumber', Value: 'RCPT_REPLAY' }
              ]
            }
          }
        }
      };

      // First call
      const res1 = await request(app)
        .post(`/api/mpesa/callback?token=${validToken}`)
        .send(payload);
      expect(res1.status).toBe(200);

      // Replay call
      const res2 = await request(app)
        .post(`/api/mpesa/callback?token=${validToken}`)
        .send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.message).toMatch(/already processed/i);
    });
  });

  // =========================================================================
  // 2. DB-P2-01: Database-Level Idempotency Constraints Tests
  // =========================================================================
  describe('2. DB-P2-01: Database-Level Unique Idempotency Constraints', () => {
    it('2.1: Enforces unique constraint on Sales (shopId, idempotencyKey)', async () => {
      const testKey = `idemp_unique_${Date.now()}`;

      // Insert first sale with testKey
      await Sale.create({
        shopId: shop1.id,
        userId: user1.id,
        idempotencyKey: testKey,
        total: 100.00,
        paymentAmount: 100.00,
        subtotal: 100.00,
        taxRate: 0.00,
        paymentMethod: 'cash',
        saleStatus: 'completed'
      });

      // Attempt inserting second sale in the SAME shop with identical idempotencyKey
      let constraintViolated = false;
      try {
        await Sale.create({
          shopId: shop1.id,
          userId: user1.id,
          idempotencyKey: testKey,
          total: 100.00,
          paymentAmount: 100.00,
          subtotal: 100.00,
          taxRate: 0.00,
          paymentMethod: 'cash',
          saleStatus: 'completed'
        });
      } catch (err) {
        constraintViolated = err.name === 'SequelizeUniqueConstraintError';
      }

      expect(constraintViolated).toBe(true);
    });

    it('2.2: Allows same idempotencyKey across DIFFERENT shops (tenant-safe scoping)', async () => {
      const crossShopKey = `cross_shop_key_${Date.now()}`;

      const saleShop1 = await Sale.create({
        shopId: shop1.id,
        userId: user1.id,
        idempotencyKey: crossShopKey,
        total: 50.00,
        paymentAmount: 50.00,
        subtotal: 50.00,
        taxRate: 0.00,
        paymentMethod: 'cash'
      });

      const saleShop2 = await Sale.create({
        shopId: shop2.id,
        userId: user1.id,
        idempotencyKey: crossShopKey,
        total: 75.00,
        paymentAmount: 75.00,
        subtotal: 75.00,
        taxRate: 0.00,
        paymentMethod: 'cash'
      });

      expect(saleShop1.id).toBeDefined();
      expect(saleShop2.id).toBeDefined();
      expect(saleShop1.shopId).toBe(shop1.id);
      expect(saleShop2.shopId).toBe(shop2.id);
    });

    it('2.3: Allows multiple Sales with NULL idempotencyKey (legacy POS compatibility)', async () => {
      const saleNull1 = await Sale.create({
        shopId: shop1.id,
        userId: user1.id,
        idempotencyKey: null,
        total: 20.00,
        paymentAmount: 20.00,
        subtotal: 20.00,
        taxRate: 0.00,
        paymentMethod: 'cash'
      });

      const saleNull2 = await Sale.create({
        shopId: shop1.id,
        userId: user1.id,
        idempotencyKey: null,
        total: 30.00,
        paymentAmount: 30.00,
        subtotal: 30.00,
        taxRate: 0.00,
        paymentMethod: 'cash'
      });

      expect(saleNull1.id).toBeDefined();
      expect(saleNull2.id).toBeDefined();
    });

    it('2.4: Enforces unique constraint on PendingPayments.checkoutRequestId', async () => {
      const reqId = `chk_dup_test_${Date.now()}`;

      await PendingPayment.create({
        checkoutRequestId: reqId,
        orderId: `ord_${reqId}`,
        amount: 200.00,
        status: 'pending',
        paymentChannel: 'card',
        shopId: shop1.id
      });

      let constraintViolated = false;
      try {
        await PendingPayment.create({
          checkoutRequestId: reqId,
          orderId: `ord_second_${reqId}`,
          amount: 200.00,
          status: 'pending',
          paymentChannel: 'card',
          shopId: shop1.id
        });
      } catch (err) {
        constraintViolated = err.name === 'SequelizeUniqueConstraintError';
      }

      expect(constraintViolated).toBe(true);
    });
  });

  // =========================================================================
  // 3. RISK-01: Distributed AI L1 Cache Invalidation Tests
  // =========================================================================
  describe('3. RISK-01: Multi-Replica Distributed AI L1 Cache Invalidation', () => {
    let replicaA_L1;
    let replicaB_L1;

    beforeEach(() => {
      replicaA_L1 = new NodeCache({ stdTTL: 3600 });
      replicaB_L1 = new NodeCache({ stdTTL: 3600 });
    });

    it('3.1: Invalidation event evicts cached forecasts across both simulated replicas', () => {
      const keyA = `ai:forecast:org:${org1.id}:shop:${shop1.id}:prophet:7:hash123`;
      const keyB = `ai:forecast:org:${org1.id}:shop:${shop1.id}:prophet:7:hash123`;

      replicaA_L1.set(keyA, { forecast: [10, 20, 30] });
      replicaB_L1.set(keyB, { forecast: [10, 20, 30] });

      expect(replicaA_L1.get(keyA)).toBeDefined();
      expect(replicaB_L1.get(keyB)).toBeDefined();

      const invalidationMessage = JSON.stringify({
        type: 'shop',
        organizationId: org1.id,
        shopId: shop1.id,
        timestamp: Date.now()
      });

      // Simulate broadcast received by Replica A and Replica B
      aiCacheService.handleDistributedInvalidation(invalidationMessage, replicaA_L1);
      aiCacheService.handleDistributedInvalidation(invalidationMessage, replicaB_L1);

      expect(replicaA_L1.get(keyA)).toBeUndefined();
      expect(replicaB_L1.get(keyB)).toBeUndefined();
    });

    it('3.2: Strict Tenant Scoping: Org 1 invalidation does NOT evict Org 2 forecast', () => {
      const org1Key = `ai:forecast:org:${org1.id}:shop:${shop1.id}:prophet:7:hash1`;
      const org2Key = `ai:forecast:org:${org2.id}:shop:${shop2.id}:prophet:7:hash2`;

      replicaA_L1.set(org1Key, { forecast: 'org1_data' });
      replicaA_L1.set(org2Key, { forecast: 'org2_data' });

      const invalidationMessage = JSON.stringify({
        type: 'organization',
        organizationId: org1.id,
        timestamp: Date.now()
      });

      aiCacheService.handleDistributedInvalidation(invalidationMessage, replicaA_L1);

      expect(replicaA_L1.get(org1Key)).toBeUndefined(); // Evicted
      expect(replicaA_L1.get(org2Key)).toEqual({ forecast: 'org2_data' }); // Preserved!
    });

    it('3.3: Strict Shop Scoping: Shop 1 invalidation does NOT evict Shop 2 forecast', () => {
      const shop1Key = `ai:forecast:org:${org1.id}:shop:${shop1.id}:prophet:7:hash1`;
      const shop2Key = `ai:forecast:org:${org1.id}:shop:${shop2.id}:prophet:7:hash2`;

      replicaB_L1.set(shop1Key, { forecast: 'shop1_data' });
      replicaB_L1.set(shop2Key, { forecast: 'shop2_data' });

      const invalidationMessage = JSON.stringify({
        type: 'shop',
        organizationId: org1.id,
        shopId: shop1.id,
        timestamp: Date.now()
      });

      aiCacheService.handleDistributedInvalidation(invalidationMessage, replicaB_L1);

      expect(replicaB_L1.get(shop1Key)).toBeUndefined(); // Evicted
      expect(replicaB_L1.get(shop2Key)).toEqual({ forecast: 'shop2_data' }); // Preserved!
    });

    it('3.4: Resilient handling of malformed or corrupt pub/sub messages', () => {
      expect(() => {
        aiCacheService.handleDistributedInvalidation('invalid-json{{{', replicaA_L1);
        aiCacheService.handleDistributedInvalidation(null, replicaA_L1);
        aiCacheService.handleDistributedInvalidation({}, replicaA_L1);
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 4. OPS-P2-01: Automated Database Backup Scheduler Tests
  // =========================================================================
  describe('4. OPS-P2-01: Automated Database Backup Scheduler Safeguards', () => {
    beforeEach(() => {
      backupScheduler.releaseLock();
    });

    afterEach(() => {
      backupScheduler.releaseLock();
    });

    it('4.1: acquireLock() acquires lock and prevents concurrent overlapping execution', () => {
      const lockedFirst = backupScheduler.acquireLock();
      expect(lockedFirst).toBe(true);

      // Second attempt while lock is active must be rejected
      const lockedSecond = backupScheduler.acquireLock();
      expect(lockedSecond).toBe(false);

      // Release lock
      backupScheduler.releaseLock();
      expect(fs.existsSync(backupScheduler.LOCK_FILE)).toBe(false);

      // Now lock can be acquired again
      const lockedThird = backupScheduler.acquireLock();
      expect(lockedThird).toBe(true);
    });

    it('4.2: runScheduledBackupPass() skips execution if lock is held', async () => {
      backupScheduler.acquireLock();

      const result = await backupScheduler.runScheduledBackupPass();
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('OVERLAPPING_LOCK');
    });

    it('4.3: Automatically detects and breaks stale locks (>180 mins)', () => {
      const staleTimestamp = Date.now() - (185 * 60 * 1000); // 185 mins ago
      fs.writeFileSync(
        backupScheduler.LOCK_FILE,
        JSON.stringify({ pid: 99999, timestamp: staleTimestamp })
      );

      // Attempting to acquire lock should detect stale age, break lock, and succeed
      const acquired = backupScheduler.acquireLock();
      expect(acquired).toBe(true);
    });
  });
});
