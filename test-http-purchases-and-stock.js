const path = require('path');
require('./backend/node_modules/dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const http = require('http');
const rawAxios = require('./backend/node_modules/axios');
const axios = rawAxios.default || rawAxios;
const app = require('./backend/src/app');
const { sequelize, Purchase, PurchaseOrder, Product } = require('./backend/src/models');

const jwt = require('./backend/node_modules/jsonwebtoken');
const TEST_PORT = 3098;
const BASE_URL = `http://localhost:${TEST_PORT}`;

const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// Sign valid RS256 JWT test token
const authHeader = {
  headers: {
    Authorization: `Bearer ${jwt.sign(
      { id: 1, email: 'admin@zana.pos', role: 'admin', shopId: 1 },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    )}`
  }
};

async function runRealHttpIntegrationTests() {
  console.log('🌐 Starting Real HTTP Integration & Edge-Case Test Suite...\n');

  let server;
  let passedTests = 0;
  let totalTests = 7;

  try {
    // 1. Start real Express HTTP server
    await new Promise((resolve) => {
      server = app.listen(TEST_PORT, () => {
        console.log(`🚀 Real Express HTTP Server listening on ${BASE_URL}`);
        resolve();
      });
    });

    // 2. Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected.\n');

    // 3. Ensure test product exists in DB with shopId: 1 & active: true
    let product = await Product.findOne();
    if (!product) {
      product = await Product.create({
        sku: 'HTTP-TEST-SKU-001',
        name: 'HTTP Real Test Product 500ml',
        price: 250.00,
        cost: 150.00,
        stockQuantity: 100,
        reorderPoint: 10,
        active: true,
        shopId: 1
      });
    } else {
      product.shopId = 1;
      product.active = true;
      await product.save();
    }

    const initialStock = product.stockQuantity;
    console.log(`📦 Initial Product Stock (ID: ${product.id}, SKU: ${product.sku}): ${initialStock}\n`);

    // -------------------------------------------------------------
    // HTTP Test 1: POST /api/purchases — Invalid / Negative Quantity (Expect HTTP 400)
    // -------------------------------------------------------------
    console.log('HTTP Test 1: POST /api/purchases with negative item quantity...');
    try {
      await axios.post(`${BASE_URL}/api/purchases`, {
        supplierName: 'Test Vendor',
        items: [{ productId: product.id, quantity: -10, unitCost: 100 }]
      }, authHeader);
      console.log('  ❌ Failed: Express endpoint accepted negative quantity!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`  ✅ Passed: Express returned HTTP 400 Bad Request ("${err.response.data.error}")`);
        passedTests++;
      } else {
        console.log('  ❌ Failed with unexpected status:', err.message);
      }
    }

    // -------------------------------------------------------------
    // HTTP Test 2: POST /api/purchases — Missing Supplier Name (Expect HTTP 400)
    // -------------------------------------------------------------
    console.log('\nHTTP Test 2: POST /api/purchases with empty supplier name...');
    try {
      await axios.post(`${BASE_URL}/api/purchases`, {
        supplierName: '   ',
        items: [{ productId: product.id, quantity: 10, unitCost: 100 }]
      }, authHeader);
      console.log('  ❌ Failed: Express endpoint accepted empty supplier name!');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log(`  ✅ Passed: Express returned HTTP 400 Bad Request ("${err.response.data.error}")`);
        passedTests++;
      } else {
        console.log('  ❌ Failed with unexpected status:', err.message);
      }
    }

    // -------------------------------------------------------------
    // HTTP Test 3: POST /api/purchases — Non-Existent Product ID (Expect HTTP 404)
    // -------------------------------------------------------------
    console.log('\nHTTP Test 3: POST /api/purchases with non-existent product ID...');
    try {
      await axios.post(`${BASE_URL}/api/purchases`, {
        supplierName: 'Valid Supplier',
        items: [{ productId: 9999999, quantity: 5, unitCost: 100 }]
      }, authHeader);
      console.log('  ❌ Failed: Express endpoint accepted invalid product ID!');
    } catch (err) {
      if (err.response && err.response.status === 404) {
        console.log(`  ✅ Passed: Express returned HTTP 404 Not Found ("${err.response.data.error}")`);
        passedTests++;
      } else {
        console.log('  ❌ Failed with unexpected status:', err.message);
      }
    }

    // -------------------------------------------------------------
    // HTTP Test 4: POST /api/purchase-orders — Duplicate PO Number (Expect HTTP 409)
    // -------------------------------------------------------------
    console.log('\nHTTP Test 4: POST /api/purchase-orders with duplicate PO number...');
    const dupPoNumber = `PO-HTTP-DUP-${Date.now()}`;
    const firstPoRes = await axios.post(`${BASE_URL}/api/purchase-orders`, {
      poNumber: dupPoNumber,
      supplierName: 'Original Vendor',
      items: [{ productId: product.id, quantityOrdered: 20, unitCost: 100 }]
    }, authHeader);

    const poRecord1Id = firstPoRes.data.id;

    try {
      await axios.post(`${BASE_URL}/api/purchase-orders`, {
        poNumber: dupPoNumber,
        supplierName: 'Duplicate Vendor',
        items: [{ productId: product.id, quantityOrdered: 20, unitCost: 100 }]
      }, authHeader);
      console.log('  ❌ Failed: Express allowed duplicate PO number!');
    } catch (err) {
      if (err.response && err.response.status === 409) {
        console.log(`  ✅ Passed: Express returned HTTP 409 Conflict ("${err.response.data.error}")`);
        passedTests++;
      } else {
        console.log('  ❌ Failed with unexpected status:', err.message);
      }
    }

    // Cleanup first PO record
    await PurchaseOrder.destroy({ where: { id: poRecord1Id } });

    // -------------------------------------------------------------
    // HTTP Test 5: Real HTTP Purchase Creation & Stock Auto-Increment (Expect HTTP 201)
    // -------------------------------------------------------------
    console.log('\nHTTP Test 5: POST /api/purchases — Valid Purchase (Expect HTTP 201 & Stock Increase)...');
    const validPurchRes = await axios.post(`${BASE_URL}/api/purchases`, {
      supplierName: 'Apex Distributors Ltd',
      supplierContact: '+254711223344',
      status: 'RECEIVED',
      paymentStatus: 'PAID',
      paymentMethod: 'M-PESA',
      items: [{ productId: product.id, productName: product.name, sku: product.sku, quantity: 30, unitCost: 150 }]
    }, authHeader);

    if (validPurchRes.status === 201) {
      await product.reload();
      console.log(`  ✅ Passed: Express returned HTTP 201 Created (Ref: ${validPurchRes.data.referenceNo}).`);
      console.log(`  📦 Product Stock in DB updated from ${initialStock} -> ${product.stockQuantity} (Expected: ${initialStock + 30})`);
      if (product.stockQuantity === initialStock + 30) {
        passedTests++;
      } else {
        console.log('  ❌ Stock mismatch!');
      }
    }

    // Clean up created purchase
    await Purchase.destroy({ where: { id: validPurchRes.data.id } });
    await product.decrement('stockQuantity', { by: 30 });
    await product.reload();

    // -------------------------------------------------------------
    // HTTP Test 6: Real HTTP PO Partial Receiving & Delta Stock Increment (Expect HTTP 200)
    // -------------------------------------------------------------
    console.log('\nHTTP Test 6: PATCH /api/purchase-orders/:id/status — Partial Receiving & Stock Delta...');
    const poCreateRes = await axios.post(`${BASE_URL}/api/purchase-orders`, {
      supplierName: 'Eldoret Dairy Co-op',
      items: [{ productId: product.id, productName: product.name, sku: product.sku, quantityOrdered: 100, unitCost: 150 }]
    }, authHeader);

    const createdPoId = poCreateRes.data.id;
    const stockBeforePartial = product.stockQuantity;

    // Send HTTP PATCH for partial delivery of 40 units
    const patchRes = await axios.patch(`${BASE_URL}/api/purchase-orders/${createdPoId}/status`, {
      status: 'PARTIALLY_RECEIVED',
      receivedItems: [{ productId: product.id, quantityReceived: 40 }]
    }, authHeader);

    await product.reload();
    console.log(`  🔹 Express HTTP PATCH returned status '${patchRes.data.status}'. Product stock updated to ${product.stockQuantity} (Expected: ${stockBeforePartial + 40})`);

    if (patchRes.data.status === 'PARTIALLY_RECEIVED' && product.stockQuantity === stockBeforePartial + 40) {
      console.log('  ✅ Passed: Partial PO receiving via Express HTTP API succeeded!');
      passedTests++;
    } else {
      console.log('  ❌ Partial PO receiving failed!');
    }

    // Clean up PO and restore stock
    await PurchaseOrder.destroy({ where: { id: createdPoId } });
    await product.decrement('stockQuantity', { by: 40 });
    await product.reload();

    // -------------------------------------------------------------
    // HTTP Test 7: Real HTTP Product Stock Update (Expect HTTP 200 & DB Persistence)
    // -------------------------------------------------------------
    console.log('\nHTTP Test 7: PUT /api/products/:id — Stock Management API Update...');
    const stockTarget = 150;
    const stockUpdateRes = await axios.put(`${BASE_URL}/api/products/${product.id}`, {
      name: product.name,
      sku: product.sku,
      price: product.price,
      cost: product.cost,
      stockQuantity: stockTarget,
      reorderPoint: product.reorderPoint,
      CategoryId: product.categoryId || product.CategoryId || 1
    }, authHeader);

    await product.reload();
    if (stockUpdateRes.status === 200 && product.stockQuantity === stockTarget) {
      console.log(`  ✅ Passed: Express HTTP PUT /api/products/${product.id} successfully updated stock in DB to ${product.stockQuantity}.`);
      passedTests++;
    } else {
      console.log('  ❌ Product stock update failed!');
    }

    // Restore original stock
    await product.update({ stockQuantity: initialStock });
    await product.reload();

    console.log(`\n==================================================`);
    console.log(`🎯 REAL HTTP E2E TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
    console.log(`==================================================\n`);

    try {
      const redisClient = require('./backend/src/config/redis');
      redisClient.disconnect();
    } catch (_) {}

    if (server) server.close();
    setTimeout(() => process.exit(0), 200);
  } catch (err) {
    console.error('❌ Real HTTP E2E Test Suite Error:', err.response?.data || err.message);
    try {
      const redisClient = require('./backend/src/config/redis');
      redisClient.disconnect();
    } catch (_) {}
    if (server) server.close();
    setTimeout(() => process.exit(1), 200);
  }
}

runRealHttpIntegrationTests();
