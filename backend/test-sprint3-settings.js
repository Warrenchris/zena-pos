const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const assert = require('assert');
const sequelize = require('./src/config/database');
const { Permission, RolePermission, Shop, User, ActivityLog } = require('./src/models');
const permissionController = require('./src/controllers/permissionController');
const { checkPermission } = require('./src/middleware/rolePermissions');

async function runSprint3Tests() {
  console.log('🧪 Starting Sprint 3 (Roles & Permissions UI) Integration Tests...\n');

  // Setup test shop & users (1 admin user, 1 cashier user)
  const [shop] = await Shop.findOrCreate({
    where: { name: 'Sprint 3 Permissions Test Shop' },
    defaults: { address: '456 Role Ave', phone: '0722222222' }
  });

  const testShopId = shop.id;

  const [adminUser] = await User.findOrCreate({
    where: { email: 'perm_admin_test@zana.com' },
    defaults: {
      name: 'Permissions Admin',
      password: 'password123',
      role: 'admin',
      shopId: testShopId
    }
  });

  const [cashierUser] = await User.findOrCreate({
    where: { email: 'perm_cashier_test@zana.com' },
    defaults: {
      name: 'Permissions Cashier',
      password: 'password123',
      role: 'cashier',
      shopId: testShopId
    }
  });

  const createMockReq = (user, body = {}) => ({
    shopId: testShopId,
    user: { id: user.id, role: user.role, name: user.name },
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

  // Test 1: Fetching Matrix (GET)
  console.log('1. Testing GET /api/permissions/matrix (Fetching Matrix)...');
  const getRes = createMockRes();
  await permissionController.getPermissionMatrix(createMockReq(adminUser), getRes);

  assert.strictEqual(getRes.statusCode, 200, 'GET matrix should return HTTP 200');
  assert.strictEqual(getRes.responseData?.success, true, 'GET matrix should return success = true');
  assert.deepStrictEqual(getRes.responseData?.roles, ['admin', 'manager', 'cashier'], 'Should return expected roles');
  assert.strictEqual(Array.isArray(getRes.responseData?.permissions), true, 'Should return array of permissions');
  assert.strictEqual(getRes.responseData?.permissions.length > 0, true, 'Permissions array should not be empty');
  assert.strictEqual(typeof getRes.responseData?.matrix?.admin, 'object', 'Matrix should contain admin object');
  console.log('   ✅ Fetching permission matrix passed!');

  // Test 2: Updating Permission Mapping (PUT)
  console.log('\n2. Testing PUT /api/permissions/matrix (Updating Cashier Permission)...');
  const targetPerm = getRes.responseData?.permissions.find(p => p.name === 'view_reports') || getRes.responseData?.permissions[0];
  
  const updateRes = createMockRes();
  await permissionController.updatePermissionMatrix(
    createMockReq(adminUser, {
      updates: [
        { role: 'cashier', permissionId: targetPerm.id, permissionName: targetPerm.name, enabled: true }
      ]
    }),
    updateRes
  );

  assert.strictEqual(updateRes.statusCode, 200, 'PUT matrix update should return HTTP 200');
  assert.strictEqual(updateRes.responseData?.matrix?.cashier?.[targetPerm.name], true, 'Cashier should now have view_reports permission = true');
  
  // Verify persistence in DB
  const dbMapping = await RolePermission.findOne({
    where: { role: 'cashier', permissionId: targetPerm.id }
  });
  assert.notStrictEqual(dbMapping, null, 'RolePermission record must be persisted in DB');
  console.log('   ✅ Updating & persisting permission mapping passed!');

  // Test 3: Lockout Prevention (Attempting to remove admin manage_settings)
  console.log('\n3. Testing Self-Lockout Prevention (Removing admin manage_settings)...');
  const lockoutRes = createMockRes();
  await permissionController.updatePermissionMatrix(
    createMockReq(adminUser, {
      updates: [
        { role: 'admin', permissionName: 'manage_settings', enabled: false }
      ]
    }),
    lockoutRes
  );

  assert.strictEqual(lockoutRes.statusCode, 400, 'Should reject stripping manage_settings from admin with HTTP 400');
  assert.strictEqual(lockoutRes.responseData?.error.includes('lockout'), true, 'Error message should explain lockout protection');
  console.log('   ✅ Self-lockout rejection passed!');

  // Test 4: Middleware Permission Guard (Forbidden 403 for cashier)
  console.log('\n4. Testing Role Permission Middleware Guard (Forbidden 403 for unauthorized users)...');
  const middleware = checkPermission('manage_settings');
  
  const reqCashier = createMockReq(cashierUser);
  const resCashier = createMockRes();
  let nextCalled = false;

  await middleware(reqCashier, resCashier, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false, 'Next middleware should not be called for cashier');
  assert.strictEqual(resCashier.statusCode, 403, 'Middleware should respond with HTTP 403 Forbidden');
  assert.strictEqual(resCashier.responseData?.error, 'Permission denied', 'Error should state Permission denied');
  console.log('   ✅ Middleware 403 Forbidden check passed!');

  // Cleanup test records
  await ActivityLog.destroy({ where: { shopId: testShopId } });
  await RolePermission.destroy({ where: { role: 'cashier', permissionId: targetPerm.id } });
  await User.destroy({ where: { id: adminUser.id } });
  await User.destroy({ where: { id: cashierUser.id } });
  await Shop.destroy({ where: { id: testShopId } });
  await sequelize.close();

  console.log('\n🎉 ALL SPRINT 3 ROLES & PERMISSIONS TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runSprint3Tests().catch((err) => {
  console.error('\n❌ SPRINT 3 TEST FAILED:', err);
  process.exit(1);
});
