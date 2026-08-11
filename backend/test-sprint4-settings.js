const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const assert = require('assert');
const sequelize = require('./src/config/database');
const { SystemSettings, Shop, User, Product, Category, ActivityLog } = require('./src/models');
const { calculateEan13CheckDigit, generateEAN13, generateUPC, generateBarcode, generateSKU } = require('./src/utils/skuGenerator');
const productController = require('./src/controllers/productController');
const settingsController = require('./src/controllers/settingsController');

async function runSprint4Tests() {
  console.log('🧪 Starting Sprint 4 (Inventory & Notifications Quick Wins) Integration Tests...\n');

  // Setup test shop, user, and category
  const [shop] = await Shop.findOrCreate({
    where: { name: 'Sprint 4 Inventory Test Shop' },
    defaults: { address: '789 Inventory Blvd', phone: '0733333333' }
  });

  const testShopId = shop.id;

  const [user] = await User.findOrCreate({
    where: { email: 'inventory_admin_test@zana.com' },
    defaults: {
      name: 'Inventory Admin',
      password: 'password123',
      role: 'admin',
      shopId: testShopId
    }
  });

  const [category] = await Category.findOrCreate({
    where: { name: 'Sprint 4 Category', shopId: testShopId }
  });

  const createMockReq = (body = {}) => ({
    shopId: testShopId,
    user: { id: user.id, role: user.role, shopId: testShopId, isEmployee: false },
    body
  });

  const createMockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.responseData = data;
      return res;
    };
    return res;
  };

  // Test 1: EAN-13 Check Digit Calculation & Barcode Generation
  console.log('1. Testing EAN-13 Check-Digit Calculation...');
  // Standard EAN-13 example: '400638133393' -> check digit should be 1
  const test12Digits = '400638133393';
  const computedCheckDigit = calculateEan13CheckDigit(test12Digits);
  assert.strictEqual(computedCheckDigit, 1, 'Check digit for 400638133393 must be 1');

  const generatedEan = generateEAN13();
  assert.strictEqual(generatedEan.length, 13, 'Generated EAN-13 barcode must be 13 digits long');
  const eanFirst12 = generatedEan.substring(0, 12);
  const eanCheckDigit = parseInt(generatedEan.substring(12), 10);
  assert.strictEqual(calculateEan13CheckDigit(eanFirst12), eanCheckDigit, 'Generated EAN-13 check digit must match formula calculation');
  console.log(`   Generated EAN-13 barcode: ${generatedEan}`);
  console.log('   ✅ EAN-13 Check-Digit validation passed!');

  // Test 2: SKU Generator with Prefix
  console.log('\n2. Testing SKU Generation with Prefix...');
  const customPrefix = 'PRODTEST';
  const generatedSku = generateSKU(customPrefix, 42);
  assert.strictEqual(generatedSku.startsWith('PRODTEST-00042-'), true, 'SKU must begin with configured prefix and padded sequence');
  console.log(`   Generated SKU sample: ${generatedSku}`);
  console.log('   ✅ SKU generation with custom prefix passed!');

  // Test 3: SystemSettings PUT for Inventory & AI settings
  console.log('\n3. Testing Settings Persistence (lowStockThreshold, skuPrefix, barcodeFormat, aiDigestFrequency)...');
  const updateSettingsRes = createMockRes();
  await settingsController.updateSettings(
    createMockReq({
      lowStockThreshold: 15,
      skuPrefix: 'ZANA',
      barcodeFormat: 'EAN13',
      aiDigestFrequency: 'daily'
    }),
    updateSettingsRes
  );

  assert.strictEqual(updateSettingsRes.statusCode, 200, 'PUT /api/settings should return HTTP 200');
  const settingsData = updateSettingsRes.responseData?.data;
  assert.strictEqual(parseInt(settingsData?.lowStockThreshold, 10), 15, 'lowStockThreshold must update to 15');
  assert.strictEqual(settingsData?.skuPrefix, 'ZANA', 'skuPrefix must update to ZANA');
  assert.strictEqual(settingsData?.aiDigestFrequency, 'daily', 'aiDigestFrequency must update to daily');
  console.log('   ✅ Settings API persistence passed!');

  // Test 4: Product creation auto SKU, Barcode, and Low Stock Threshold fallback
  console.log('\n4. Testing Product Creation with Auto-Generated SKU/Barcode & reorderPoint Fallback...');
  const createProdRes = createMockRes();
  await productController.createProduct(
    createMockReq({
      name: 'Auto Generated Product Test',
      sku: '', // Blank -> test auto generation
      barcode: '', // Blank -> test auto generation
      price: 250.00,
      cost: 150.00,
      stockQuantity: 12,
      reorderPoint: null, // Blank -> test system setting fallback (15)
      CategoryId: category.id
    }),
    createProdRes
  );

  if (createProdRes.statusCode !== 201) {
    console.error('Product Creation Error Data:', createProdRes.responseData);
  }
  assert.strictEqual(createProdRes.statusCode, 201, 'POST /api/products should return HTTP 201 Created');
  const newProduct = createProdRes.responseData;
  assert.strictEqual(newProduct.sku.startsWith('ZANA-'), true, 'Auto SKU must use configured prefix ZANA');
  assert.strictEqual(newProduct.barcode.length, 13, 'Auto barcode must be 13-digit EAN13');
  assert.strictEqual(newProduct.reorderPoint, 15, 'Product reorderPoint must fall back to lowStockThreshold = 15');
  console.log(`   Created product ID: ${newProduct.id}, SKU: ${newProduct.sku}, Barcode: ${newProduct.barcode}, reorderPoint: ${newProduct.reorderPoint}`);
  console.log('   ✅ Auto SKU/Barcode creation and lowStockThreshold fallback passed!');

  // Cleanup test records
  await ActivityLog.destroy({ where: { shopId: testShopId } });
  await Product.destroy({ where: { id: newProduct.id } });
  await Category.destroy({ where: { id: category.id } });
  await SystemSettings.destroy({ where: { shopId: testShopId } });
  await User.destroy({ where: { id: user.id } });
  await Shop.destroy({ where: { id: testShopId } });
  await sequelize.close();

  console.log('\n🎉 ALL SPRINT 4 INVENTORY & NOTIFICATIONS TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runSprint4Tests().catch((err) => {
  console.error('\n❌ SPRINT 4 TEST FAILED:', err);
  process.exit(1);
});
