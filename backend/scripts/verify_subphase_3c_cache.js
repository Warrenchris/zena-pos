'use strict';
require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const {
  Shop, Category, Product, Inventory, User, Organization
} = require('../src/models');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

function tokenFor(user) {
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
  return 'Bearer ' + jwt.sign(user, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

async function runCacheVerification() {
  console.log('========================================================================');
  console.log('       FINDING-12 SUB-PHASE 3C CACHE INVALIDATION VERIFICATION          ');
  console.log('========================================================================\n');

  if (redisClient.status !== 'ready') {
    console.log('Waiting for Redis client...');
    await new Promise(resolve => redisClient.once('ready', resolve));
  }

  const orgId = 910;
  const shop1Id = 911;
  const shop2Id = 912;
  const userId = 919;

  try {
    // 1. Setup Org and Shops
    const [org] = await Organization.findOrCreate({
      where: { id: orgId },
      defaults: { name: 'Cache Test Org', slug: 'cache-test-org' }
    });

    const [shop1] = await Shop.findOrCreate({
      where: { id: shop1Id },
      defaults: { name: 'Shop 1', organizationId: org.id, active: true }
    });
    shop1.organizationId = org.id;
    await shop1.save();

    const [shop2] = await Shop.findOrCreate({
      where: { id: shop2Id },
      defaults: { name: 'Shop 2', organizationId: org.id, active: true }
    });
    shop2.organizationId = org.id;
    await shop2.save();

    const tokenShop1 = tokenFor({ id: userId, role: 'admin', shopId: shop1.id, organizationId: org.id });
    const tokenShop2 = tokenFor({ id: userId, role: 'admin', shopId: shop2.id, organizationId: org.id });

    // 2. Setup Category & Product
    const [cat] = await Category.findOrCreate({
      where: { id: 915 },
      defaults: { name: 'Cache Cat', shopId: shop1.id }
    });

    const sku = `CACHE-TEST-${Date.now()}`;
    const [product] = await Product.findOrCreate({
      where: { sku },
      defaults: {
        name: 'Cache Verification Product',
        sku,
        barcode: `BAR-${Date.now()}`,
        price: 99.00,
        cost: 45.00,
        organizationId: org.id,
        shopId: shop1.id,
        categoryId: cat.id,
        active: true
      }
    });

    await Inventory.findOrCreate({
      where: { productId: product.id, shopId: shop1.id },
      defaults: { productId: product.id, shopId: shop1.id, stockQuantity: 25, reorderPoint: 5 }
    });

    await Inventory.findOrCreate({
      where: { productId: product.id, shopId: shop2.id },
      defaults: { productId: product.id, shopId: shop2.id, stockQuantity: 35, reorderPoint: 5 }
    });

    // Clear existing cache keys if any
    const keyShop1 = `products:shop:${shop1.id}`;
    const keyShop2 = `products:shop:${shop2.id}`;
    await redisClient.del(keyShop1);
    await redisClient.del(keyShop2);

    // STEP 1: Populate caches for both shops via GET /api/products
    console.log('Step 1: Populating Redis caches for Shop 1 and Shop 2...');
    const resGet1 = await request(app).get('/api/products').set('Authorization', tokenShop1).expect(200);
    const resGet2 = await request(app).get('/api/products').set('Authorization', tokenShop2).expect(200);

    const cachedVal1 = await redisClient.get(keyShop1);
    const cachedVal2 = await redisClient.get(keyShop2);

    console.log(`  Shop 1 cache key (${keyShop1}) populated: ${Boolean(cachedVal1)}`);
    console.log(`  Shop 2 cache key (${keyShop2}) populated: ${Boolean(cachedVal2)}`);

    if (!cachedVal1 || !cachedVal2) {
      throw new Error('Cache population failed in Step 1!');
    }
    console.log('>> Step 1 PASSED: Both shop product caches successfully populated.\n');

    // STEP 2: Update catalog field (price) via PUT /api/products/:id
    console.log('Step 2: Updating catalog field (price: 99.00 -> 120.00) via PUT /api/products/:id...');
    const updateRes = await request(app)
      .put(`/api/products/${product.id}`)
      .set('Authorization', tokenShop1)
      .send({ price: 120.00 });

    if (updateRes.status !== 200) {
      throw new Error(`Catalog update failed with status ${updateRes.status}: ${JSON.stringify(updateRes.body)}`);
    }

    const postUpdateCache1 = await redisClient.get(keyShop1);
    const postUpdateCache2 = await redisClient.get(keyShop2);

    console.log(`  Shop 1 cache key (${keyShop1}) after catalog edit: ${postUpdateCache1 ? 'STILL EXISTS (FAIL)' : 'DELETED (PASS)'}`);
    console.log(`  Shop 2 cache key (${keyShop2}) after catalog edit: ${postUpdateCache2 ? 'STILL EXISTS (FAIL)' : 'DELETED (PASS)'}`);

    if (postUpdateCache1 !== null || postUpdateCache2 !== null) {
      throw new Error('Org-wide cache invalidation failed: not all shop caches were invalidated!');
    }
    console.log('>> Step 2 PASSED: Catalog edit invalidated ALL branch caches in the organization.\n');

    // STEP 3: Re-populate both caches, then update stock for Shop 1 ONLY
    console.log('Step 3: Re-populating both caches, then updating stock for Shop 1 only...');
    await request(app).get('/api/products').set('Authorization', tokenShop1).expect(200);
    await request(app).get('/api/products').set('Authorization', tokenShop2).expect(200);

    const recheck1 = await redisClient.get(keyShop1);
    const recheck2 = await redisClient.get(keyShop2);
    if (!recheck1 || !recheck2) {
      throw new Error('Failed to re-populate caches in Step 3!');
    }
    console.log(`  Both caches re-populated successfully.`);

    console.log(`  Performing PATCH /api/products/:id/stock for Shop 1 (delta: +10)...`);
    const stockRes = await request(app)
      .patch(`/api/products/${product.id}/stock`)
      .set('Authorization', tokenShop1)
      .send({ quantity: 10 });

    if (stockRes.status !== 200) {
      throw new Error(`Stock adjustment failed with status ${stockRes.status}: ${JSON.stringify(stockRes.body)}`);
    }

    const postStockCache1 = await redisClient.get(keyShop1);
    const postStockCache2 = await redisClient.get(keyShop2);

    console.log(`  Shop 1 cache key (${keyShop1}) after stock mutation: ${postStockCache1 ? 'STILL EXISTS (FAIL)' : 'DELETED (PASS)'}`);
    console.log(`  Shop 2 cache key (${keyShop2}) after stock mutation: ${postStockCache2 ? 'PRESERVED (PASS)' : 'DELETED (FAIL)'}`);

    if (postStockCache1 !== null) {
      throw new Error('Shop 1 cache was not invalidated after stock adjustment!');
    }
    if (postStockCache2 === null) {
      throw new Error('Shop 2 cache was incorrectly invalidated after Shop 1 stock adjustment!');
    }
    console.log('>> Step 3 PASSED: Stock adjustment invalidated ONLY the mutating shop cache; other shops preserved.\n');

    console.log('========================================================================');
    console.log('       CACHE INVALIDATION VERIFICATION COMPLETED WITH 100% SUCCESS       ');
    console.log('========================================================================\n');

  } finally {
    // Cleanup fixtures
    try {
      await redisClient.del(`products:shop:${shop1Id}`);
      await redisClient.del(`products:shop:${shop2Id}`);
      await Inventory.destroy({ where: { shopId: [shop1Id, shop2Id] } }).catch(() => {});
      await Product.destroy({ where: { organizationId: orgId } }).catch(() => {});
      await Category.destroy({ where: { id: 915 } }).catch(() => {});
      await Shop.destroy({ where: { id: [shop1Id, shop2Id] } }).catch(() => {});
      await Organization.destroy({ where: { id: orgId } }).catch(() => {});
    } catch (_) {}
    process.exit(0);
  }
}

runCacheVerification().catch(err => {
  console.error('Cache verification failed:', err);
  process.exit(1);
});
