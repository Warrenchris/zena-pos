const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const assert = require('assert');
const fs = require('fs');
const sequelize = require('./src/config/database');
const { SystemSettings, Shop, User, ActivityLog } = require('./src/models');
const authController = require('./src/controllers/authController');
const settingsController = require('./src/controllers/settingsController');

async function runSprint2Tests() {
  console.log('🧪 Starting Sprint 2 (Security & Account) Integration Tests...\n');

  // Setup test shop & user
  const [shop] = await Shop.findOrCreate({
    where: { name: 'Sprint 2 Security Test Shop' },
    defaults: { address: '123 Security Way', phone: '0711111111', kraPin: 'A099887766Z', registrationNumber: 'REG/2026/001' }
  });

  const testShopId = shop.id;

  const initialPassword = 'oldPassword123';
  const newPassword = 'newSecretPassword456';

  const [user] = await User.findOrCreate({
    where: { email: 'security_test_user@zana.com' },
    defaults: {
      name: 'Security Admin',
      password: initialPassword,
      role: 'admin',
      shopId: testShopId
    }
  });

  // Ensure password is standard initialPassword
  user.password = initialPassword;
  await user.save();

  const mockReq = (body = {}, file = null) => ({
    shopId: testShopId,
    user: { id: user.id, isEmployee: false, name: user.name },
    body,
    file
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

  // Test 1: Change password fails with incorrect current password
  console.log('1. Testing change-password with WRONG current password...');
  const wrongPwdRes = createMockRes();
  await authController.changePassword(
    mockReq({
      currentPassword: 'wrongPassword999',
      newPassword: newPassword,
      confirmPassword: newPassword
    }),
    wrongPwdRes
  );

  assert.strictEqual(wrongPwdRes.statusCode, 400, 'Should return HTTP 400 for wrong current password');
  assert.strictEqual(wrongPwdRes.responseData?.error, 'Incorrect current password.', 'Error message should indicate incorrect current password');
  console.log('   ✅ Rejection of wrong current password passed!');

  // Test 2: Change password succeeds with correct current password
  console.log('\n2. Testing change-password with CORRECT current password...');
  const successPwdRes = createMockRes();
  await authController.changePassword(
    mockReq({
      currentPassword: initialPassword,
      newPassword: newPassword,
      confirmPassword: newPassword
    }),
    successPwdRes
  );

  assert.strictEqual(successPwdRes.statusCode, 200, 'Should return HTTP 200 on successful password change');
  assert.strictEqual(successPwdRes.responseData?.success, true, 'Should indicate success = true');

  // Verify updated password validation
  const updatedUser = await User.findByPk(user.id);
  const isValidOld = await updatedUser.validatePassword(initialPassword);
  const isValidNew = await updatedUser.validatePassword(newPassword);
  assert.strictEqual(isValidOld, false, 'Old password should no longer validate');
  assert.strictEqual(isValidNew, true, 'New password should validate successfully');
  console.log('   ✅ Password change and login validation passed!');

  // Test 3: Logo upload endpoint (valid image)
  console.log('\n3. Testing Logo Upload with valid image file...');
  const testLogoFilename = `logo_test_${Date.now()}.png`;
  const mockFile = {
    filename: testLogoFilename,
    originalname: 'test_logo.png',
    mimetype: 'image/png',
    size: 1024 * 50 // 50KB
  };

  const uploadRes = createMockRes();
  await settingsController.uploadLogo(mockReq({}, mockFile), uploadRes);

  assert.strictEqual(uploadRes.statusCode, 200, 'Should return HTTP 200 for valid logo upload');
  assert.strictEqual(uploadRes.responseData?.success, true, 'Should return success = true');
  assert.strictEqual(uploadRes.responseData?.logoUrl, `/uploads/logos/${testLogoFilename}`, 'Should return correct relative logo URL');

  // Verify SystemSettings updated in DB
  const dbSettings = await SystemSettings.findOne({ where: { shopId: testShopId } });
  assert.strictEqual(dbSettings?.businessLogo, `/uploads/logos/${testLogoFilename}`, 'DB businessLogo should match uploaded logoUrl');
  console.log('   ✅ Business logo upload & DB update passed!');

  // Cleanup test records
  await ActivityLog.destroy({ where: { shopId: testShopId } });
  await SystemSettings.destroy({ where: { shopId: testShopId } });
  await User.destroy({ where: { id: user.id } });
  await Shop.destroy({ where: { id: testShopId } });
  await sequelize.close();

  console.log('\n🎉 ALL SPRINT 2 SECURITY & ACCOUNT TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runSprint2Tests().catch((err) => {
  console.error('\n❌ SPRINT 2 TEST FAILED:', err);
  process.exit(1);
});
