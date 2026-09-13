'use strict';
require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
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

async function runInsightsAlertsVerification() {
  console.log('========================================================================');
  console.log('       FINDING-12 SUB-PHASE 3C INSIGHTS/ALERTS VERIFICATION             ');
  console.log('========================================================================\n');

  const orgId = 920;
  const shop1Id = 921;
  const shop2Id = 922;
  const userId = 929;

  try {
    // 1. Setup Org and Shops
    const [org] = await Organization.findOrCreate({
      where: { id: orgId },
      defaults: { name: 'Insights Test Org', slug: 'insights-test-org' }
    });

    const [shop1] = await Shop.findOrCreate({
      where: { id: shop1Id },
      defaults: { name: 'Insights Shop 1', organizationId: org.id, active: true }
    });
    shop1.organizationId = org.id;
    await shop1.save();

    const [shop2] = await Shop.findOrCreate({
      where: { id: shop2Id },
      defaults: { name: 'Insights Shop 2', organizationId: org.id, active: true }
    });
    shop2.organizationId = org.id;
    await shop2.save();

    const tokenShop1 = tokenFor({ id: userId, role: 'admin', shopId: shop1.id, organizationId: org.id });
    const tokenShop2 = tokenFor({ id: userId, role: 'admin', shopId: shop2.id, organizationId: org.id });

    // 2. Setup Category & Product
    const [cat] = await Category.findOrCreate({
      where: { id: 925 },
      defaults: { name: 'Insights Cat', shopId: shop1.id }
    });

    const sku = `ALERT-TEST-${Date.now()}`;
    const [product] = await Product.findOrCreate({
      where: { sku },
      defaults: {
        name: 'Alert Low-Stock Item',
        sku,
        barcode: `BAR-${Date.now()}`,
        price: 50.00,
        cost: 25.00,
        organizationId: org.id,
        shopId: shop1.id,
        categoryId: cat.id,
        active: true
      }
    });

    // Shop 1 has low stock: 2 units (critical threshold <= 5)
    await Inventory.findOrCreate({
      where: { productId: product.id, shopId: shop1.id },
      defaults: { productId: product.id, shopId: shop1.id, stockQuantity: 2, reorderPoint: 10 }
    });

    // Shop 2 has healthy stock: 50 units (well above critical threshold)
    await Inventory.findOrCreate({
      where: { productId: product.id, shopId: shop2.id },
      defaults: { productId: product.id, shopId: shop2.id, stockQuantity: 50, reorderPoint: 10 }
    });

    console.log(`[Setup] Product ID ${product.id} ("${product.name}") created.`);
    console.log(`  Shop 1 (${shop1.name}) stockQuantity = 2, reorderPoint = 10 (CRITICAL LOW)`);
    console.log(`  Shop 2 (${shop2.name}) stockQuantity = 50, reorderPoint = 10 (HEALTHY)\n`);

    // STEP 1: Query GET /api/insights for Shop 1
    console.log('Querying GET /api/insights for Shop 1...');
    const res1 = await request(app)
      .get('/api/insights')
      .set('Authorization', tokenShop1)
      .expect(200);

    const alertsShop1 = res1.body.alerts || [];
    const invAlertShop1 = alertsShop1.find(a => a.type === 'INVENTORY');
    const targetProductAlertShop1 = invAlertShop1?.details?.find(d => d.id === product.id);

    console.log(`  Shop 1 Inventory Alerts Found: ${invAlertShop1 ? 'YES' : 'NO'}`);
    console.log(`  Alert contains low-stock product (${product.name}): ${Boolean(targetProductAlertShop1)}`);
    if (targetProductAlertShop1) {
      console.log(`    Reported Stock in Shop 1 Alert: ${targetProductAlertShop1.currentStock} units`);
    }

    if (!targetProductAlertShop1 || targetProductAlertShop1.currentStock !== 2) {
      throw new Error(`Verification 6 Failed: Shop 1 did not report low-stock alert with currentStock=2 for product ${product.id}`);
    }
    console.log('>> Shop 1 Alert Check: PASSED\n');

    // STEP 2: Query GET /api/insights for Shop 2
    console.log('Querying GET /api/insights for Shop 2...');
    const res2 = await request(app)
      .get('/api/insights')
      .set('Authorization', tokenShop2)
      .expect(200);

    const alertsShop2 = res2.body.alerts || [];
    const invAlertShop2 = alertsShop2.find(a => a.type === 'INVENTORY');
    const targetProductAlertShop2 = invAlertShop2?.details?.find(d => d.id === product.id);

    console.log(`  Alert contains product (${product.name}) in Shop 2: ${Boolean(targetProductAlertShop2)}`);

    if (targetProductAlertShop2) {
      throw new Error(`Verification 6 Failed: Shop 2 incorrectly saw a low-stock alert for product ${product.id} with stock 50!`);
    }
    console.log('>> Shop 2 Alert Isolation Check: PASSED (No low-stock alert emitted for healthy stock)\n');

    console.log('========================================================================');
    console.log('       INSIGHTS INVENTORY ALERTS VERIFICATION COMPLETED WITH 100% SUCCESS');
    console.log('========================================================================\n');

  } finally {
    // Cleanup fixtures
    try {
      await Inventory.destroy({ where: { shopId: [shop1Id, shop2Id] } }).catch(() => {});
      await Product.destroy({ where: { organizationId: orgId } }).catch(() => {});
      await Category.destroy({ where: { id: 925 } }).catch(() => {});
      await Shop.destroy({ where: { id: [shop1Id, shop2Id] } }).catch(() => {});
      await Organization.destroy({ where: { id: orgId } }).catch(() => {});
    } catch (_) {}
    process.exit(0);
  }
}

runInsightsAlertsVerification().catch(err => {
  console.error('Insights verification failed:', err);
  process.exit(1);
});
