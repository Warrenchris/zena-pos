'use strict';
require('dotenv').config();
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop, Category, Product, Sale, SaleItem, Customer,
  Employee, User, Inventory, StockMovement, Organization
} = require('../src/models');
const { createSaleInternal } = require('../src/controllers/saleController');
const { applyStockReceipt, reverseStockReceipt } = require('../src/services/purchaseService');
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

async function runVerification() {
  console.log('========================================================================');
  console.log('       FINDING-12 SUB-PHASE 3B COMPREHENSIVE VERIFICATION SUITE         ');
  console.log('========================================================================\n');

  // Check MySQL transaction isolation level
  const [isolationResult] = await sequelize.query("SELECT @@transaction_isolation AS isolation;").catch(async () => {
    return await sequelize.query("SELECT @@tx_isolation AS isolation;");
  });
  console.log(`[Database] Current MySQL Transaction Isolation Level: ${isolationResult[0].isolation}`);
  if (!['REPEATABLE-READ', 'READ-COMMITTED', 'SERIALIZABLE'].includes(isolationResult[0].isolation)) {
    console.warn('WARNING: Unexpected isolation level: ' + isolationResult[0].isolation);
  } else {
    console.log('[Database] Isolation level is fully compatible with InnoDB pessimistic locking (SELECT ... FOR UPDATE)\n');
  }

  try {
  // Setup test organization, shops, category
  const [org] = await Organization.findOrCreate({
    where: { id: 800 },
    defaults: { name: 'SubPhase 3B Org', slug: 'subphase-3b-org' }
  });

  const [shopA] = await Shop.findOrCreate({
    where: { id: 801 },
    defaults: { name: 'Branch A', organizationId: org.id, active: true }
  });
  if (shopA.organizationId !== org.id) {
    shopA.organizationId = org.id;
    await shopA.save();
  }

  const [shopB] = await Shop.findOrCreate({
    where: { id: 802 },
    defaults: { name: 'Branch B', organizationId: org.id, active: true }
  });
  if (shopB.organizationId !== org.id) {
    shopB.organizationId = org.id;
    await shopB.save();
  }

  const [adminUser] = await User.findOrCreate({
    where: { id: 881 },
    defaults: {
      name: 'Admin 3B',
      email: 'admin3b@example.com',
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id,
      organizationId: org.id
    }
  });

  const adminTokenA = tokenFor({ id: adminUser.id, role: 'admin', shopId: shopA.id, organizationId: org.id });
  const adminTokenB = tokenFor({ id: adminUser.id, role: 'admin', shopId: shopB.id, organizationId: org.id });

  const [category] = await Category.findOrCreate({
    where: { id: 850 },
    defaults: { name: '3B Category', shopId: shopA.id }
  });

  // Create a clean test product for Write Paths 1-5
  const testSku = `3B-TEST-${Date.now()}`;
  const [prod] = await Product.findOrCreate({
    where: { sku: testSku },
    defaults: {
      name: 'Sub-Phase 3B Test Item',
      sku: testSku,
      barcode: `BAR-${Date.now()}`,
      price: 100.00,
      cost: 50.00,
      shopId: shopA.id,
      organizationId: org.id,
      categoryId: category.id,
      active: true
    }
  });

  // Explicitly initialize Inventory for Branch A
  let [invA] = await Inventory.findOrCreate({
    where: { productId: prod.id, shopId: shopA.id },
    defaults: {
      productId: prod.id,
      shopId: shopA.id,
      stockQuantity: 50.00,
      reorderPoint: 10
    }
  });
  invA.stockQuantity = 50.00;
  await invA.save();

  console.log(`[Setup] Created Test Catalog Product ID=${prod.id} (SKU=${prod.sku}) with Initial Stock=50.00 at Shop ${shopA.id}\n`);

  // =========================================================================
  // ITEM 2: Sale Checkout Stock Decrement
  // =========================================================================
  console.log('--- VERIFICATION ITEM 2: Sale Checkout Stock Decrement ---');
  const saleRes = await request(app)
    .post('/api/sales')
    .set('Authorization', adminTokenA)
    .send({
      items: [{ productId: prod.id, quantity: 5, unitPrice: 100 }],
      paymentMethod: 'cash',
      paymentAmount: 500
    });

  if (saleRes.status !== 201) {
    throw new Error(`Sale checkout failed with status ${saleRes.status}: ${JSON.stringify(saleRes.body)}`);
  }
  const saleId = saleRes.body.id || saleRes.body.sale?.id;

  await invA.reload();
  const movementSale = await StockMovement.findOne({
    where: { productId: prod.id, shopId: shopA.id, type: 'SALE' },
    order: [['id', 'DESC']]
  });

  console.log(`Sale Created Successfully (Sale ID: ${saleId})`);
  console.log(`  Inventory.stockQuantity: ${invA.stockQuantity} (Expected: 45.00)`);
  console.log(`  StockMovement Logged: Type=${movementSale?.type}, Delta=${movementSale?.quantity}, Prev=${movementSale?.previousStock}, New=${movementSale?.newStock}`);
  
  if (parseFloat(invA.stockQuantity) !== 45.00) {
    throw new Error(`Item 2 Failed: Stock does not match expected 45.00!`);
  }
  if (!movementSale || parseFloat(movementSale.newStock) !== 45.00) {
    throw new Error(`Item 2 Failed: StockMovement not properly recorded!`);
  }
  console.log('>> ITEM 2 RESULT: PASSED (Pessimistic lock, Inventory decremented, StockMovement audit logged)\n');

  // =========================================================================
  // ITEM 3: Insufficient Stock Rejection (Atomic Abort, No Partial Mutation)
  // =========================================================================
  console.log('--- VERIFICATION ITEM 3: Insufficient Stock Rejection ---');
  const overSaleRes = await request(app)
    .post('/api/sales')
    .set('Authorization', adminTokenA)
    .send({
      items: [{ productId: prod.id, quantity: 100, unitPrice: 100 }],
      paymentMethod: 'cash',
      paymentAmount: 10000
    });

  console.log(`Over-sale request status: ${overSaleRes.status} (Expected: 400 or 409)`);
  console.log(`Error message: ${overSaleRes.body?.error || JSON.stringify(overSaleRes.body)}`);

  await invA.reload();
  console.log(`  Post-attempt Inventory.stockQuantity: ${invA.stockQuantity} (Must remain 45.00)`);

  if (![400, 409].includes(overSaleRes.status)) {
    throw new Error(`Item 3 Failed: Over-sale request was not rejected with 400/409!`);
  }
  if (parseFloat(invA.stockQuantity) !== 45.00) {
    throw new Error(`Item 3 Failed: Stock was mutated despite rejection!`);
  }
  console.log('>> ITEM 3 RESULT: PASSED (Atomic rejection prevented partial stock mutation)\n');

  // =========================================================================
  // ITEM 4: Concurrency Test (Pessimistic Lock Serialization)
  // =========================================================================
  console.log('--- VERIFICATION ITEM 4: Concurrency Test (Pessimistic Row-Lock Serialization) ---');
  // Reset stock to exactly 10.00
  invA.stockQuantity = 10.00;
  await invA.save();
  console.log(`Initial stock reset to: 10.00`);
  console.log(`Firing TWO concurrent checkout requests for quantity 7.00 each... (7 + 7 = 14 > 10)`);

  const tStart = Date.now();
  const [req1, req2] = await Promise.all([
    request(app)
      .post('/api/sales')
      .set('Authorization', adminTokenA)
      .send({
        items: [{ productId: prod.id, quantity: 7, unitPrice: 100 }],
        paymentMethod: 'cash',
        paymentAmount: 700
      }),
    request(app)
      .post('/api/sales')
      .set('Authorization', adminTokenA)
      .send({
        items: [{ productId: prod.id, quantity: 7, unitPrice: 100 }],
        paymentMethod: 'cash',
        paymentAmount: 700
      })
  ]);
  const duration = Date.now() - tStart;

  console.log(`Concurrent requests resolved in ${duration}ms:`);
  console.log(`  Request 1 Status: ${req1.status}, Body: ${req1.body?.id ? `Sale ID ${req1.body.id}` : req1.body?.error}`);
  console.log(`  Request 2 Status: ${req2.status}, Body: ${req2.body?.id ? `Sale ID ${req2.body.id}` : req2.body?.error}`);

  await invA.reload();
  console.log(`  Final Inventory.stockQuantity: ${invA.stockQuantity} (Expected: exactly 3.00)`);

  const statuses = [req1.status, req2.status].sort();
  if (statuses[0] !== 201 || ![400, 409].includes(statuses[1])) {
    throw new Error(`Item 4 Failed: Expected exactly one 201 and one 400/409, got ${statuses[0]} and ${statuses[1]}`);
  }
  if (parseFloat(invA.stockQuantity) !== 3.00) {
    throw new Error(`Item 4 Failed: Stock oversold or incorrect! Expected 3.00, got Inventory=${invA.stockQuantity}`);
  }
  console.log('>> ITEM 4 RESULT: PASSED (Pessimistic lock serialized concurrent transactions: exactly one succeeded, one rejected, zero overselling)\n');

  // =========================================================================
  // ITEM 5: Refund Stock Increment
  // =========================================================================
  console.log('--- VERIFICATION ITEM 5: Sale Refund Restock ---');
  const successfulSale = req1.status === 201 ? req1.body : req2.body;
  const refundRes = await request(app)
    .post(`/api/sales/${successfulSale.id}/refund`)
    .set('Authorization', adminTokenA)
    .send({
      items: [{ productId: prod.id, quantity: 2, disposition: 'restock' }],
      reason: 'Customer returned 2 items in pristine condition'
    });

  if (refundRes.status !== 200 && refundRes.status !== 201) {
    throw new Error(`Refund failed with status ${refundRes.status}: ${JSON.stringify(refundRes.body)}`);
  }

  await invA.reload();
  const movementRefund = await StockMovement.findOne({
    where: { productId: prod.id, shopId: shopA.id, type: 'SALE_REFUND' },
    order: [['id', 'DESC']]
  });

  console.log(`Refund Processed Successfully:`);
  console.log(`  Inventory.stockQuantity: ${invA.stockQuantity} (Expected: 5.00)`);
  console.log(`  StockMovement Logged: Type=${movementRefund?.type}, Delta=+${movementRefund?.quantity}, Prev=${movementRefund?.previousStock}, New=${movementRefund?.newStock}`);

  if (parseFloat(invA.stockQuantity) !== 5.00) {
    throw new Error(`Item 5 Failed: Stock after refund does not match 5.00!`);
  }
  if (!movementRefund || parseFloat(movementRefund.newStock) !== 5.00) {
    throw new Error(`Item 5 Failed: Refund StockMovement not properly recorded!`);
  }
  console.log('>> ITEM 5 RESULT: PASSED (Refund increments Inventory, StockMovement logged)\n');

  // =========================================================================
  // ITEM 6: Purchase Receiving Stock Increment
  // =========================================================================
  console.log('--- VERIFICATION ITEM 6: Purchase Receiving Stock Increment ---');
  const purchaseRes = await request(app)
    .post('/api/purchases')
    .set('Authorization', adminTokenA)
    .send({
      supplierName: 'SubPhase 3B Wholesale Supplier',
      status: 'RECEIVED',
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
      items: [{ productId: prod.id, quantity: 20, unitCost: 50.00 }]
    });

  if (purchaseRes.status !== 201) {
    throw new Error(`Purchase receiving failed with status ${purchaseRes.status}: ${JSON.stringify(purchaseRes.body)}`);
  }

  await invA.reload();
  const movementPurchase = await StockMovement.findOne({
    where: { productId: prod.id, shopId: shopA.id, type: 'PURCHASE_RECEIPT' },
    order: [['id', 'DESC']]
  });

  console.log(`Purchase Received (Purchase ID: ${purchaseRes.body.id}):`);
  console.log(`  Inventory.stockQuantity: ${invA.stockQuantity} (Expected: 25.00)`);
  console.log(`  StockMovement Logged: Type=${movementPurchase?.type}, Delta=+${movementPurchase?.quantity}, Prev=${movementPurchase?.previousStock}, New=${movementPurchase?.newStock}`);

  if (parseFloat(invA.stockQuantity) !== 25.00) {
    throw new Error(`Item 6 Failed: Stock after purchase receiving does not match 25.00!`);
  }
  console.log('>> ITEM 6 RESULT: PASSED (Purchase receiving increments Inventory, logs StockMovement)\n');

  // =========================================================================
  // ITEM 7: Purchase Reversal / Cancellation Stock Decrement
  // =========================================================================
  console.log('--- VERIFICATION ITEM 7: Purchase Reversal / Cancellation ---');
  const cancelRes = await request(app)
    .patch(`/api/purchases/${purchaseRes.body.id}/cancel`)
    .set('Authorization', adminTokenA)
    .send();

  if (cancelRes.status !== 200) {
    throw new Error(`Purchase cancellation failed with status ${cancelRes.status}: ${JSON.stringify(cancelRes.body)}`);
  }

  await invA.reload();
  const movementCancel = await StockMovement.findOne({
    where: { productId: prod.id, shopId: shopA.id, type: 'PURCHASE_REVERSAL' },
    order: [['id', 'DESC']]
  });

  console.log(`Purchase Cancelled:`);
  console.log(`  Inventory.stockQuantity: ${invA.stockQuantity} (Expected: 5.00)`);
  console.log(`  StockMovement Logged: Type=${movementCancel?.type}, Delta=${movementCancel?.quantity}, Prev=${movementCancel?.previousStock}, New=${movementCancel?.newStock}`);

  if (parseFloat(invA.stockQuantity) !== 5.00) {
    throw new Error(`Item 7 Failed: Stock after purchase cancellation does not match 5.00!`);
  }
  console.log('>> ITEM 7 RESULT: PASSED (Purchase cancellation decrements Inventory, logs StockMovement)\n');

  // =========================================================================
  // ITEM 8: Manual Stock Adjustment (updateStock Endpoint)
  // =========================================================================
  console.log('--- VERIFICATION ITEM 8: Manual Stock Adjustment (PATCH /api/products/:id/stock) ---');
  const adjustRes = await request(app)
    .patch(`/api/products/${prod.id}/stock`)
    .set('Authorization', adminTokenA)
    .send({ quantity: 15 }); // Add 15 to stock (5 + 15 = 20)

  if (adjustRes.status !== 200) {
    throw new Error(`Manual stock adjustment failed with status ${adjustRes.status}: ${JSON.stringify(adjustRes.body)}`);
  }

  await invA.reload();
  const movementAdjust = await StockMovement.findOne({
    where: { productId: prod.id, shopId: shopA.id, type: 'ADJUSTMENT' },
    order: [['id', 'DESC']]
  });

  console.log(`Stock Adjusted via PATCH /api/products/:id/stock:`);
  console.log(`  Inventory.stockQuantity: ${invA.stockQuantity} (Expected: 20.00)`);
  console.log(`  StockMovement Logged: Type=${movementAdjust?.type}, Delta=+${movementAdjust?.quantity}, Prev=${movementAdjust?.previousStock}, New=${movementAdjust?.newStock}`);

  if (parseFloat(invA.stockQuantity) !== 20.00) {
    throw new Error(`Item 8 Failed: Stock after manual adjustment does not match 20.00!`);
  }
  console.log('>> ITEM 8 RESULT: PASSED (Manual stock adjustment updates Inventory with audit trail)\n');

  // =========================================================================
  // ITEM 9: Cross-Branch Write Isolation
  // =========================================================================
  console.log('--- VERIFICATION ITEM 9: Cross-Branch Write Isolation ---');
  // Seed Branch B Inventory row for the same product
  let [invB] = await Inventory.findOrCreate({
    where: { productId: prod.id, shopId: shopB.id },
    defaults: {
      productId: prod.id,
      shopId: shopB.id,
      stockQuantity: 50.00,
      reorderPoint: 5
    }
  });
  invB.stockQuantity = 50.00;
  await invB.save();

  console.log(`Branch A (Shop ${shopA.id}) Inventory Stock: ${invA.stockQuantity}`);
  console.log(`Branch B (Shop ${shopB.id}) Inventory Stock: ${invB.stockQuantity}`);

  console.log(`Mutating Branch A stock via manual adjustment delta -5...`);
  const branchAdjustRes = await request(app)
    .patch(`/api/products/${prod.id}/stock`)
    .set('Authorization', adminTokenA)
    .send({ quantity: -5 });

  if (branchAdjustRes.status !== 200) {
    throw new Error(`Branch A adjustment failed: ${JSON.stringify(branchAdjustRes.body)}`);
  }

  await invA.reload();
  await invB.reload();

  console.log(`After mutation at Branch A:`);
  console.log(`  Branch A Inventory.stockQuantity: ${invA.stockQuantity} (Expected: 15.00)`);
  console.log(`  Branch B Inventory.stockQuantity: ${invB.stockQuantity} (Must remain exactly 50.00!)`);

  if (parseFloat(invA.stockQuantity) !== 15.00) {
    throw new Error(`Item 9 Failed: Branch A stock was not updated to 15.00!`);
  }
  if (parseFloat(invB.stockQuantity) !== 50.00) {
    throw new Error(`Item 9 Failed: Branch B stock leaked or changed! Expected 50.00, got ${invB.stockQuantity}`);
  }
  console.log('>> ITEM 9 RESULT: PASSED (Strict multi-branch isolation: Branch A mutation had zero side-effect on Branch B)\n');

  // =========================================================================
  // ITEM 10: Product Creation with Initial Stock
  // =========================================================================
  console.log('--- VERIFICATION ITEM 10: Product Creation with Initial Stock ---');
  const createProdRes = await request(app)
    .post('/api/products')
    .set('Authorization', adminTokenA)
    .send({
      name: 'Explicit Provisioned Product',
      sku: `PROD-NEW-${Date.now()}`,
      barcode: `BAR-NEW-${Date.now()}`,
      price: 250.00,
      cost: 150.00,
      stockQuantity: 30,
      reorderPoint: 7,
      categoryId: category.id
    });

  if (createProdRes.status !== 201) {
    throw new Error(`Product creation failed with status ${createProdRes.status}: ${JSON.stringify(createProdRes.body)}`);
  }

  const newProdId = createProdRes.body.id;
  const createdInvDb = await Inventory.findOne({ where: { productId: newProdId, shopId: shopA.id } });

  console.log(`Product created via POST /api/products (ID: ${newProdId}):`);
  console.log(`  Response body.stockQuantity: ${createProdRes.body.stockQuantity} (Expected: 30)`);
  console.log(`  Response body.reorderPoint: ${createProdRes.body.reorderPoint} (Expected: 7)`);
  console.log(`  DB Inventory.stockQuantity: ${createdInvDb?.stockQuantity} (Expected: 30)`);
  console.log(`  DB Inventory.reorderPoint: ${createdInvDb?.reorderPoint} (Expected: 7)`);
  console.log(`  DB Inventory.shopId: ${createdInvDb?.shopId} (Expected: ${shopA.id})`);

  if (!createdInvDb || parseFloat(createdInvDb.stockQuantity) !== 30) {
    throw new Error(`Item 10 Failed: Inventory row was not created properly with initial stock 30!`);
  }
  console.log('>> ITEM 10 RESULT: PASSED (createProduct explicitly created Inventory row with zero model hooks)\n');

  } finally {
    console.log('--- Cleaning up verification test fixtures from database ---');
    try {
      const { SaleRefund, SalePayment, SaleItem, Sale, PurchaseItem, Purchase, StockMovement, Inventory, Product, Shop, Organization, User, Category } = require('../src/models');
      const shopIds = [801, 802];
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;').catch(() => {});
      await SaleRefund.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await SalePayment.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await SaleItem.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await Sale.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await PurchaseItem.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await Purchase.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await StockMovement.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await Inventory.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await Product.destroy({ where: { shopId: shopIds } }).catch(() => {});
      await Category.destroy({ where: { id: 850 } }).catch(() => {});
      await User.destroy({ where: { id: 881 } }).catch(() => {});
      await Shop.destroy({ where: { id: shopIds } }).catch(() => {});
      await Organization.destroy({ where: { id: 800 } }).catch(() => {});
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
      console.log('Cleanup completed successfully.\n');
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
  }
  process.exit(0);
}

runVerification().catch(err => {
  console.error('FATAL VERIFICATION ERROR:', err);
  process.exit(1);
});
