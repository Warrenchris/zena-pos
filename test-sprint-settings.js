const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'backend/.env') });

const assert = require('assert');
const { encrypt, decrypt, maskSecret, isMaskedValue } = require('./backend/src/utils/encryption');

async function runTests() {
  console.log('🧪 Starting Sprint 1 Settings & Encryption Unit / Integration Tests...\n');

  // Test 1: Encryption & Decryption Roundtrip
  console.log('1. Testing Encryption & Decryption...');
  const secretText = 'my_super_secret_mpesa_key_12345';
  const encrypted = encrypt(secretText);
  assert.notStrictEqual(encrypted, secretText, 'Encrypted string must not match plain text');
  assert.strictEqual(encrypted.includes(':'), true, 'Encrypted string should contain IV separator');
  
  const decrypted = decrypt(encrypted);
  assert.strictEqual(decrypted, secretText, 'Decrypted string must match original plain text');
  console.log('   ✅ Encryption & Decryption round-trip passed!');

  // Test 2: Masking Secret
  console.log('\n2. Testing Secret Masking...');
  const masked = maskSecret(secretText);
  assert.strictEqual(masked.startsWith('*'), true, 'Masked secret should start with stars');
  assert.strictEqual(masked.endsWith('2345'), true, 'Masked secret should show last 4 chars');
  assert.strictEqual(masked.includes(secretText), false, 'Masked secret must not leak full plain text');
  assert.strictEqual(isMaskedValue(masked), true, 'isMaskedValue helper should return true for masked strings');
  console.log(`   Masked sample: "${masked}"`);
  console.log('   ✅ Secret masking passed!');

  // Test 3: Model & DB Storage Integration
  console.log('\n3. Testing SystemSettings Database Persistence & Controller Masking...');
  const sequelize = require('./backend/src/config/database');
  const { SystemSettings, Shop } = require('./backend/src/models');
  const settingsController = require('./backend/src/controllers/settingsController');

  // Setup test shop & settings
  const [shop] = await Shop.findOrCreate({
    where: { name: 'Sprint 1 Test Shop' },
    defaults: { address: 'Test Address', phone: '0700000000' }
  });

  const testShopId = shop.id;
  
  // Clean prior test settings for shop
  await SystemSettings.destroy({ where: { shopId: testShopId } });

  // Mock Request & Response objects for getSettings & updateSettings
  const mockReq = (body = {}) => ({
    shopId: testShopId,
    user: { id: 1, name: 'Admin Tester' },
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

  // Perform Update via Controller
  const updateRes = createMockRes();
  await settingsController.updateSettings(
    mockReq({
      taxRate: 16.50,
      receiptHeader: 'Welcome to Zana POS Test Shop',
      receiptFooter: 'Thank you for your business!',
      showLogoOnReceipt: true,
      printerType: 'thermal',
      printerIP: '192.168.1.50:9100',
      paybillNumber: '174379',
      tillNumber: '554433',
      consumerKey: 'my_mpesa_consumer_key_xyz',
      consumerSecret: 'my_mpesa_consumer_secret_999',
      passkey: 'my_mpesa_online_passkey_777',
      enabledPaymentMethods: { cash: true, mobile: true, bank: false }
    }),
    updateRes
  );

  assert.strictEqual(updateRes.statusCode, 200, 'PUT /api/settings should return HTTP 200');
  assert.strictEqual(updateRes.responseData?.success, true, 'PUT /api/settings should succeed');
  assert.strictEqual(parseFloat(updateRes.responseData?.data?.taxRate), 16.50, 'Tax rate should be updated to 16.50');
  
  // Verify secrets returned in response are masked
  const updatedData = updateRes.responseData?.data;
  assert.strictEqual(updatedData?.consumerKey.startsWith('*'), true, 'consumerKey in PUT response must be masked');
  assert.strictEqual(updatedData?.consumerSecret.startsWith('*'), true, 'consumerSecret in PUT response must be masked');
  assert.strictEqual(updatedData?.passkey.startsWith('*'), true, 'passkey in PUT response must be masked');
  console.log('   ✅ PUT update & response secret masking passed!');

  // Verify Database actually stored ENCRYPTED secret strings
  const dbSettings = await SystemSettings.findOne({ where: { shopId: testShopId } });
  assert.notStrictEqual(dbSettings.consumerKey, 'my_mpesa_consumer_key_xyz', 'Raw plain text consumerKey must not be stored in DB');
  assert.strictEqual(dbSettings.consumerKey.includes(':'), true, 'Encrypted IV format must be stored in DB');
  assert.strictEqual(decrypt(dbSettings.consumerKey), 'my_mpesa_consumer_key_xyz', 'DB cipher text must decrypt back to original consumerKey');
  console.log('   ✅ Encrypted DB storage verified!');

  // Perform GET via Controller
  const getRes = createMockRes();
  await settingsController.getSettings(mockReq(), getRes);
  assert.strictEqual(getRes.statusCode, 200, 'GET /api/settings should return HTTP 200');
  const getData = getRes.responseData?.data;
  assert.strictEqual(getData?.taxRate, '16.50', 'GET should return taxRate 16.50');
  assert.strictEqual(getData?.consumerKey.startsWith('*'), true, 'GET must never leak plain text consumerKey');
  assert.strictEqual(getData?.consumerSecret.startsWith('*'), true, 'GET must never leak plain text consumerSecret');
  assert.strictEqual(getData?.passkey.startsWith('*'), true, 'GET must never leak plain text passkey');
  console.log('   ✅ GET response secret masking verified!');

  // Test submitting masked values back (ensure it doesn't overwrite DB with masked stars)
  const reUpdateRes = createMockRes();
  await settingsController.updateSettings(
    mockReq({
      taxRate: 18.00,
      consumerKey: getData?.consumerKey, // sending back masked string
      consumerSecret: getData?.consumerSecret,
      passkey: getData?.passkey
    }),
    reUpdateRes
  );

  const reDbSettings = await SystemSettings.findOne({ where: { shopId: testShopId } });
  assert.strictEqual(parseFloat(reDbSettings.taxRate), 18.00, 'taxRate updated to 18.00');
  assert.strictEqual(decrypt(reDbSettings.consumerKey), 'my_mpesa_consumer_key_xyz', 'Secret must remain intact after submitting masked string');
  console.log('   ✅ Submitting masked values back without overwriting secrets verified!');

  // Cleanup test records
  await SystemSettings.destroy({ where: { shopId: testShopId } });
  await Shop.destroy({ where: { id: testShopId } });
  await sequelize.close();

  console.log('\n🎉 ALL SPRINT 1 SETTINGS TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
