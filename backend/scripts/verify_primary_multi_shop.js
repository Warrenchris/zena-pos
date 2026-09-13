const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const {
  sequelize,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  ActivityLog,
  SystemSettings,
  User
} = require('../src/models');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(
    payload,
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: process.env.JWT_EXPIRES_IN || '2h'
    }
  );
}

async function runPrimaryVerification() {
  console.log('================================================================================');
  console.log('MULTI-SHOP FLOW VERIFICATION SUITE — PRIMARY DATABASE (zana_pos)');
  console.log('Target: ' + sequelize.config.database);
  console.log('================================================================================\n');

  let orgA, orgB;
  let shopA1, shopB1;
  let ownerUser, adminUser, memberUser;
  let ownerMembership, adminMembership, memberMembership;
  let ownerToken, adminToken, memberToken;
  let ownerCreatedShopId, adminCreatedShopId;

  try {
    await sequelize.authenticate();
    console.log('Connected to MySQL database:', sequelize.config.database);

    // Setup temporary test entities in primary DB
    console.log('\n--- SETTING UP ISOLATED TEST FIXTURES IN PRIMARY DB ---');
    orgA = await Organization.create({
      name: 'Verif Primary Org Alpha',
      slug: `verif-org-alpha-${Date.now()}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: 'Verif Primary Org Beta',
      slug: `verif-org-beta-${Date.now()}`,
      status: 'active',
      currency: 'USD'
    });

    shopA1 = await Shop.create({
      name: 'Verif Primary Shop A1',
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: 'Verif Primary Shop B1',
      organizationId: orgB.id,
      active: true
    });

    ownerUser = await User.create({
      name: 'Primary Owner User',
      email: `owner_${Date.now()}@primaryverif.com`,
      password: 'password123',
      role: 'admin',
      shopId: shopA1.id,
      active: true
    });

    adminUser = await User.create({
      name: 'Primary Admin User',
      email: `admin_${Date.now()}@primaryverif.com`,
      password: 'password123',
      role: 'admin',
      shopId: shopA1.id,
      active: true
    });

    memberUser = await User.create({
      name: 'Primary Member User',
      email: `member_${Date.now()}@primaryverif.com`,
      password: 'password123',
      role: 'cashier',
      shopId: shopA1.id,
      active: true
    });

    ownerMembership = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    adminMembership = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: adminUser.id,
      orgRole: 'admin',
      status: 'active'
    });

    memberMembership = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: memberUser.id,
      orgRole: 'member',
      status: 'active'
    });

    // Grant member explicit access to shopA1
    await ShopAccess.create({
      membershipId: memberMembership.id,
      shopId: shopA1.id,
      isDefault: true
    });

    ownerToken = tokenFor({
      id: ownerUser.id,
      role: ownerUser.role,
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    adminToken = tokenFor({
      id: adminUser.id,
      role: adminUser.role,
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    memberToken = tokenFor({
      id: memberUser.id,
      role: memberUser.role,
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    console.log('Test fixtures created successfully.\n');

    // -------------------------------------------------------------------------
    // ITEM 2: Shop creation as 'owner'
    // -------------------------------------------------------------------------
    console.log('--- ITEM 2: Shop creation as "owner" ---');
    const saCountBeforeOwner = await ShopAccess.count();
    const resOwnerCreate = await request(app)
      .post('/api/shop')
      .set('Authorization', ownerToken)
      .send({
        name: 'Primary Owner Shop',
        address: 'Nairobi CBD',
        phone: '+254711223344',
        kraPin: 'P051122334A',
        registrationNumber: 'REG-OWNER-PRIMARY'
      });

    console.log('Status:', resOwnerCreate.status);
    console.log('Response payload:', JSON.stringify(resOwnerCreate.body, null, 2));
    ownerCreatedShopId = resOwnerCreate.body.shop?.id;

    const saCountAfterOwner = await ShopAccess.count();
    console.log('ShopAccess rows before:', saCountBeforeOwner, '| after:', saCountAfterOwner);
    console.log('Zero new ShopAccess rows written:', saCountBeforeOwner === saCountAfterOwner ? 'PASS (0 written)' : 'FAIL');
    console.log('access field in response is null:', resOwnerCreate.body.access === null ? 'PASS (null)' : 'FAIL');

    const ownerLog = await ActivityLog.findOne({
      where: {
        action: 'SHOP_CREATED',
        shopId: ownerCreatedShopId
      }
    });
    console.log('ActivityLog row found:', !!ownerLog);
    if (ownerLog) {
      console.log(`ActivityLog details: action=${ownerLog.action}, entity=${ownerLog.entity}, entityId=${ownerLog.entityId}, shopId=${ownerLog.shopId}, userId=${ownerLog.userId}`);
    }

    // -------------------------------------------------------------------------
    // ITEM 3: Shop creation as 'admin'
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 3: Shop creation as "admin" ---');
    const saCountBeforeAdmin = await ShopAccess.count();
    const resAdminCreate = await request(app)
      .post('/api/shop')
      .set('Authorization', adminToken)
      .send({
        name: 'Primary Admin Shop',
        address: 'Westlands, Nairobi',
        phone: '+254722334455'
      });

    console.log('Status:', resAdminCreate.status);
    console.log('Response payload:', JSON.stringify(resAdminCreate.body, null, 2));
    adminCreatedShopId = resAdminCreate.body.shop?.id;

    const saCountAfterAdmin = await ShopAccess.count();
    console.log('ShopAccess rows before:', saCountBeforeAdmin, '| after:', saCountAfterAdmin);
    console.log('Exactly 1 new ShopAccess row written:', saCountAfterAdmin === saCountBeforeAdmin + 1 ? 'PASS (+1)' : 'FAIL');
    console.log('Real ShopAccess row returned in access field:', !!resAdminCreate.body.access && resAdminCreate.body.access.shopId === adminCreatedShopId ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // ITEM 4: Shop creation as 'member'
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 4: Shop creation as "member" ---');
    const shopCountBeforeMember = await Shop.count();
    const saCountBeforeMember = await ShopAccess.count();
    const logCountBeforeMember = await ActivityLog.count();

    const resMemberCreate = await request(app)
      .post('/api/shop')
      .set('Authorization', memberToken)
      .send({
        name: 'Primary Member Unauthorized Shop'
      });

    console.log('Status (expected 403):', resMemberCreate.status);
    console.log('Response payload:', resMemberCreate.body);

    const shopCountAfterMember = await Shop.count();
    const saCountAfterMember = await ShopAccess.count();
    const logCountAfterMember = await ActivityLog.count();
    console.log(`Shop rows: ${shopCountBeforeMember} -> ${shopCountAfterMember} (diff: ${shopCountAfterMember - shopCountBeforeMember})`);
    console.log(`ShopAccess rows: ${saCountBeforeMember} -> ${saCountAfterMember} (diff: ${saCountAfterMember - saCountBeforeMember})`);
    console.log(`ActivityLog rows: ${logCountBeforeMember} -> ${logCountAfterMember} (diff: ${logCountAfterMember - logCountBeforeMember})`);
    console.log('Zero rows written on member rejection:',
      (shopCountBeforeMember === shopCountAfterMember &&
       saCountBeforeMember === saCountAfterMember &&
       logCountBeforeMember === logCountAfterMember) ? 'PASS (0 writes)' : 'FAIL');

    // -------------------------------------------------------------------------
    // ITEM 5: Switch-shop as 'owner' with NO ShopAccess row
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 5: Switch-shop as "owner" to shop with NO ShopAccess row ---');
    const ownerHasRowBefore = await ShopAccess.findOne({
      where: { membershipId: ownerMembership.id, shopId: adminCreatedShopId }
    });
    console.log('Owner has ShopAccess row for target shop beforehand:', ownerHasRowBefore ? 'YES' : 'NO (as expected)');

    const saCountBeforeSwitchOwner = await ShopAccess.count();
    const resSwitchOwner = await request(app)
      .post('/api/auth/switch-shop')
      .set('Authorization', ownerToken)
      .send({ shopId: adminCreatedShopId });

    console.log('Status (expected 200):', resSwitchOwner.status);
    console.log('Switched target shopId:', resSwitchOwner.body.shop?.id, 'Token returned:', !!resSwitchOwner.body.token);

    const saCountAfterSwitchOwner = await ShopAccess.count();
    console.log(`ShopAccess rows before: ${saCountBeforeSwitchOwner} | after: ${saCountAfterSwitchOwner}`);
    console.log('ZERO writes on switch-shop (owner):', saCountBeforeSwitchOwner === saCountAfterSwitchOwner ? 'PASS (identical count)' : 'FAIL');

    // -------------------------------------------------------------------------
    // ITEM 6: Switch-shop as 'admin'/'member' to shop WITH ShopAccess
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 6: Switch-shop as "member" to shop WITH ShopAccess ---');
    const saCountBeforeSwitchMemberValid = await ShopAccess.count();
    const resSwitchMemberValid = await request(app)
      .post('/api/auth/switch-shop')
      .set('Authorization', memberToken)
      .send({ shopId: shopA1.id });

    console.log('Status (expected 200):', resSwitchMemberValid.status);
    console.log('Switched target shopId:', resSwitchMemberValid.body.shop?.id);

    const saCountAfterSwitchMemberValid = await ShopAccess.count();
    console.log(`ShopAccess rows before: ${saCountBeforeSwitchMemberValid} | after: ${saCountAfterSwitchMemberValid}`);
    console.log('ZERO writes on switch-shop (member with access):', saCountBeforeSwitchMemberValid === saCountAfterSwitchMemberValid ? 'PASS (identical count)' : 'FAIL');

    // -------------------------------------------------------------------------
    // ITEM 7: Switch-shop as 'admin'/'member' to shop WITHOUT ShopAccess
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 7: Switch-shop as "member" to shop WITHOUT ShopAccess ---');
    const saCountBeforeSwitchMemberDenied = await ShopAccess.count();
    const resSwitchMemberDenied = await request(app)
      .post('/api/auth/switch-shop')
      .set('Authorization', memberToken)
      .send({ shopId: adminCreatedShopId });

    console.log('Status (expected 403):', resSwitchMemberDenied.status);
    console.log('Response error:', resSwitchMemberDenied.body.error);

    const saCountAfterSwitchMemberDenied = await ShopAccess.count();
    console.log(`ShopAccess rows before: ${saCountBeforeSwitchMemberDenied} | after: ${saCountAfterSwitchMemberDenied}`);
    console.log('ZERO writes on rejected switch-shop:', saCountBeforeSwitchMemberDenied === saCountAfterSwitchMemberDenied ? 'PASS (identical count)' : 'FAIL');

    // -------------------------------------------------------------------------
    // ITEM 8: Switch-shop targeting shop in DIFFERENT organization
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 8: Switch-shop targeting shop in DIFFERENT organization ---');
    const resSwitchCrossOrg = await request(app)
      .post('/api/auth/switch-shop')
      .set('Authorization', ownerToken)
      .send({ shopId: shopB1.id });

    console.log('Status (expected 404):', resSwitchCrossOrg.status);
    console.log('Response error:', resSwitchCrossOrg.body.error);
    console.log('Returns 404 (not 403):', resSwitchCrossOrg.status === 404 ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // ITEM 9: Decode token returned by switch-shop
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 9: Decode token returned by switch-shop ---');
    const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
    const decodedToken = jwt.verify(resSwitchOwner.body.token, publicKey, { algorithms: ['RS256'] });
    console.log('Decoded Token Payload:', JSON.stringify(decodedToken, null, 2));
    const fieldsMatch = (
      decodedToken.id === ownerUser.id &&
      decodedToken.role === ownerUser.role &&
      decodedToken.shopId === adminCreatedShopId &&
      decodedToken.organizationId === orgA.id &&
      decodedToken.isEmployee === false &&
      typeof decodedToken.iat === 'number' &&
      typeof decodedToken.exp === 'number'
    );
    console.log('Claim shape matches login token shape exactly:', fieldsMatch ? 'PASS' : 'FAIL');

    // -------------------------------------------------------------------------
    // ITEM 10: GET /api/shop/accessible for owner vs member
    // -------------------------------------------------------------------------
    console.log('\n--- ITEM 10: GET /api/shop/accessible (Owner vs Member) ---');
    const resAccessibleOwner = await request(app)
      .get('/api/shop/accessible')
      .set('Authorization', ownerToken);

    console.log('[Owner Accessible Shops Response]');
    console.log(JSON.stringify(resAccessibleOwner.body, null, 2));

    const resAccessibleMember = await request(app)
      .get('/api/shop/accessible')
      .set('Authorization', memberToken);

    console.log('\n[Member Accessible Shops Response]');
    console.log(JSON.stringify(resAccessibleMember.body, null, 2));

    console.log('\nOwner sees all org shops:', resAccessibleOwner.body.shops.length >= 3 ? 'PASS' : 'FAIL');
    console.log('Member sees only granted shops (1 shop):', resAccessibleMember.body.shops.length === 1 ? 'PASS' : 'FAIL');

  } catch (err) {
    console.error('VERIFICATION ERROR:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- CLEANING UP TEST FIXTURES IN PRIMARY DB ---');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;').catch(() => {});
    try {
      if (orgA?.id || orgB?.id) {
        const orgIds = [orgA?.id, orgB?.id].filter(Boolean);
        const shops = await Shop.findAll({ where: { organizationId: orgIds } });
        const shopIds = shops.map(s => s.id);
        if (shopIds.length > 0) {
          await ActivityLog.destroy({ where: { shopId: shopIds } });
          await SystemSettings.destroy({ where: { shopId: shopIds } });
          await ShopAccess.destroy({ where: { shopId: shopIds } });
          await Shop.destroy({ where: { id: shopIds } });
        }
        await OrganizationMembership.destroy({ where: { organizationId: orgIds } });
        await Organization.destroy({ where: { id: orgIds } });
      }
      if (ownerUser?.id || adminUser?.id || memberUser?.id) {
        await User.destroy({ where: { id: [ownerUser?.id, adminUser?.id, memberUser?.id].filter(Boolean) } });
      }
      console.log('Test fixtures cleaned up successfully.');
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;').catch(() => {});
      await sequelize.close();
    }
  }
}

runPrimaryVerification();
