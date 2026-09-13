/**
 * Verification Script for FINDING-12 Phase 2
 * Verifies Items 2 through 8 on the test database (zana_pos_test).
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'zana_pos_test';

const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  User,
  Customer,
  Supplier,
  Product,
  Category
} = require('../src/models');
const { resolveSupplier } = require('../src/services/purchaseService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function mintToken(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

async function runVerification() {
  console.log('====================================================');
  console.log('STARTING PHASE 2 SPECIFICATION VERIFICATION SUITE');
  console.log('Database:', sequelize.config.database);
  console.log('====================================================\n');

  await sequelize.authenticate();

  // ----------------------------------------------------
  // ITEM 8: Confirm shopId is retained and nullable on both tables
  // ----------------------------------------------------
  console.log('--- ITEM 8: Verify shopId Schema Nullability ---');
  const [custCols] = await sequelize.query(`
    SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_KEY 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Customers' AND COLUMN_NAME IN ('shopId', 'organizationId')
  `);
  const [supCols] = await sequelize.query(`
    SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_KEY 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Suppliers' AND COLUMN_NAME IN ('shopId', 'organizationId')
  `);

  console.log('Customers Columns:', custCols);
  console.log('Suppliers Columns:', supCols);

  const custShopIdCol = custCols.find(c => c.COLUMN_NAME === 'shopId');
  const custOrgIdCol = custCols.find(c => c.COLUMN_NAME === 'organizationId');
  const supShopIdCol = supCols.find(c => c.COLUMN_NAME === 'shopId');
  const supOrgIdCol = supCols.find(c => c.COLUMN_NAME === 'organizationId');

  if (custShopIdCol.IS_NULLABLE !== 'YES') throw new Error('Customers.shopId is not nullable!');
  if (custOrgIdCol.IS_NULLABLE !== 'NO') throw new Error('Customers.organizationId is not NOT NULL!');
  if (supShopIdCol.IS_NULLABLE !== 'YES') throw new Error('Suppliers.shopId is not nullable!');
  if (supOrgIdCol.IS_NULLABLE !== 'NO') throw new Error('Suppliers.organizationId is not NOT NULL!');

  console.log('✓ ITEM 8 PASSED: Customers.shopId and Suppliers.shopId are retained and nullable.\n');

  // ----------------------------------------------------
  // ITEM 2: Collision-free migration & composite unique constraints
  // ----------------------------------------------------
  console.log('--- ITEM 2: Unique Constraint Enforcement & Collision Audit ---');
  const [custIndexes] = await sequelize.query(`SHOW INDEX FROM Customers WHERE Key_name = 'unique_customers_org_email'`);
  const [supIndexes] = await sequelize.query(`SHOW INDEX FROM Suppliers WHERE Key_name = 'unique_suppliers_org_name'`);

  console.log('Customers unique index on (organizationId, email):', custIndexes.length > 0 ? 'EXISTS' : 'MISSING');
  console.log('Suppliers unique index on (organizationId, name):', supIndexes.length > 0 ? 'EXISTS' : 'MISSING');

  if (custIndexes.length === 0) throw new Error('Missing unique_customers_org_email index');
  if (supIndexes.length === 0) throw new Error('Missing unique_suppliers_org_name index');

  // Test inserting duplicate (organizationId, email) on Customer
  const testEmail = `collision_${Date.now()}@test.com`;
  await Customer.create({
    name: 'Customer Org1',
    email: testEmail,
    organizationId: 1,
    shopId: 1
  });

  let duplicateFailed = false;
  try {
    await Customer.create({
      name: 'Customer Org1 Duplicate',
      email: testEmail,
      organizationId: 1,
      shopId: 1
    });
  } catch (err) {
    duplicateFailed = true;
    console.log('Duplicate insertion under same organization correctly rejected:', err.name);
  }
  if (!duplicateFailed) throw new Error('Duplicate (organizationId, email) should have failed!');

  // Test inserting same email under DIFFERENT organizationId
  const crossOrgCustomer = await Customer.create({
    name: 'Customer Org2 Same Email',
    email: testEmail,
    organizationId: 2,
    shopId: 2
  });
  console.log('Same email under different organization (Org 2) succeeded with ID:', crossOrgCustomer.id);
  console.log('✓ ITEM 2 PASSED: Composite unique constraints enforce intra-org uniqueness while allowing cross-org reuse.\n');

  // ----------------------------------------------------
  // SETUP FOR ITEMS 3, 4, 5, 6, 7: Real Orgs, Shops, Users, and Tokens
  // ----------------------------------------------------
  console.log('--- Setting up Real Multi-Shop Fixtures ---');
  // Create Organization 100 with Shop A and Shop B
  const [org100] = await Organization.findOrCreate({
    where: { id: 100 },
    defaults: { name: 'Acme Retail Org', slug: 'acme-retail-100', status: 'active', currency: 'KES' }
  });

  const [shopA] = await Shop.findOrCreate({
    where: { id: 1001 },
    defaults: { name: 'Acme Westlands Branch', organizationId: org100.id, active: true }
  });

  const [shopB] = await Shop.findOrCreate({
    where: { id: 1002 },
    defaults: { name: 'Acme Kilimani Branch', organizationId: org100.id, active: true }
  });

  // Create Organization 200 with Shop C (Tenant Isolation target)
  const [org200] = await Organization.findOrCreate({
    where: { id: 200 },
    defaults: { name: 'Rival Foods Org', slug: 'rival-foods-200', status: 'active', currency: 'KES' }
  });

  const [shopC] = await Shop.findOrCreate({
    where: { id: 2001 },
    defaults: { name: 'Rival CBD Branch', organizationId: org200.id, active: true }
  });

  // Users & Memberships
  const passwordHash = await bcrypt.hash('Password123!', 10);
  const [userOrg1] = await User.findOrCreate({
    where: { email: 'manager@acme.com' },
    defaults: { name: 'Acme Manager', password: passwordHash, role: 'admin', shopId: shopA.id }
  });

  const [userOrg2] = await User.findOrCreate({
    where: { email: 'manager@rival.com' },
    defaults: { name: 'Rival Manager', password: passwordHash, role: 'admin', shopId: shopC.id }
  });

  await OrganizationMembership.findOrCreate({
    where: { userId: userOrg1.id, organizationId: org100.id },
    defaults: { role: 'admin', status: 'active' }
  });

  await OrganizationMembership.findOrCreate({
    where: { userId: userOrg2.id, organizationId: org200.id },
    defaults: { role: 'admin', status: 'active' }
  });

  // Give userOrg1 ShopAccess to both shopA and shopB
  const [membershipOrg1] = await OrganizationMembership.findAll({ where: { userId: userOrg1.id } });
  await ShopAccess.findOrCreate({
    where: { membershipId: membershipOrg1.id, shopId: shopA.id },
    defaults: { isDefault: true }
  });
  await ShopAccess.findOrCreate({
    where: { membershipId: membershipOrg1.id, shopId: shopB.id },
    defaults: { isDefault: false }
  });

  // Mint tokens
  const tokenShopA = mintToken({
    id: userOrg1.id,
    role: 'admin',
    shopId: shopA.id,
    organizationId: org100.id,
    isEmployee: false
  });

  // Switch shop using endpoint POST /api/auth/switch-shop to get genuine token for Shop B
  const switchRes = await request(app)
    .post('/api/auth/switch-shop')
    .set('Authorization', `Bearer ${tokenShopA}`)
    .send({ targetShopId: shopB.id });

  if (switchRes.status !== 200) {
    throw new Error(`switch-shop failed: ${JSON.stringify(switchRes.body)}`);
  }
  const tokenShopB = switchRes.body.token;
  console.log('Successfully obtained switched token for Shop B via POST /api/auth/switch-shop');

  // Token for rival Org 200
  const tokenOrg2 = mintToken({
    id: userOrg2.id,
    role: 'admin',
    shopId: shopC.id,
    organizationId: org200.id,
    isEmployee: false
  });

  // ----------------------------------------------------
  // ITEM 3: Cross-branch customer sharing (positive case)
  // ----------------------------------------------------
  console.log('\n--- ITEM 3: Cross-Branch Customer Sharing ---');
  // Create customer via Shop A's context
  const createCustRes = await request(app)
    .post('/api/customers')
    .set('Authorization', `Bearer ${tokenShopA}`)
    .send({
      name: 'Wanjiku Kimani',
      email: `wanjiku_${Date.now()}@acmeretail.com`,
      phone: `0722${Math.floor(100000 + Math.random() * 900000)}`,
      address: 'Nairobi West'
    });

  if (createCustRes.status !== 201) {
    throw new Error(`Create customer failed: ${JSON.stringify(createCustRes.body)}`);
  }
  const sharedCustomer = createCustRes.body;
  console.log(`Created customer at Shop A: ID=${sharedCustomer.id}, Name=${sharedCustomer.name}, Origin ShopId=${sharedCustomer.shopId}, OrgId=${sharedCustomer.organizationId}`);

  // Look up customer via Shop B's context (GET /api/customers/:id)
  const lookupCustRes = await request(app)
    .get(`/api/customers/${sharedCustomer.id}`)
    .set('Authorization', `Bearer ${tokenShopB}`);

  if (lookupCustRes.status !== 200) {
    throw new Error(`Lookup customer from Shop B failed: ${lookupCustRes.status} ${JSON.stringify(lookupCustRes.body)}`);
  }
  if (lookupCustRes.body.id !== sharedCustomer.id) {
    throw new Error(`Customer ID mismatch when fetched from Shop B`);
  }
  console.log('Looked up customer from Shop B: successfully retrieved identical record ID', lookupCustRes.body.id);

  // Search customer via Shop B's context (GET /api/customers?search=Wanjiku)
  const searchCustRes = await request(app)
    .get('/api/customers?search=Wanjiku')
    .set('Authorization', `Bearer ${tokenShopB}`);

  const foundInList = searchCustRes.body.customers.some(c => c.id === sharedCustomer.id);
  if (!foundInList) throw new Error('Customer not found in Shop B customer list search');
  console.log('Search customer from Shop B: successfully found customer in list results');
  console.log('✓ ITEM 3 PASSED: Customer created at Branch A is seamlessly visible and accessible at Branch B.\n');

  // ----------------------------------------------------
  // ITEM 4: Cross-organization isolation (negative case)
  // ----------------------------------------------------
  console.log('--- ITEM 4: Cross-Organization Isolation (Negative Case) ---');
  // Org 2 user attempts to GET Org 1 customer
  const getOtherCustRes = await request(app)
    .get(`/api/customers/${sharedCustomer.id}`)
    .set('Authorization', `Bearer ${tokenOrg2}`);

  console.log(`GET customer of Org 1 from Org 2 user: HTTP ${getOtherCustRes.status}`);
  if (getOtherCustRes.status !== 404) throw new Error(`Expected 404 for cross-tenant GET, got ${getOtherCustRes.status}`);

  // Org 2 user attempts to PUT Org 1 customer
  const updateOtherCustRes = await request(app)
    .put(`/api/customers/${sharedCustomer.id}`)
    .set('Authorization', `Bearer ${tokenOrg2}`)
    .send({ name: 'Hacked Name' });

  console.log(`PUT customer of Org 1 from Org 2 user: HTTP ${updateOtherCustRes.status}`);
  if (updateOtherCustRes.status !== 404) throw new Error(`Expected 404 for cross-tenant PUT, got ${updateOtherCustRes.status}`);

  // Org 2 user attempts to DELETE Org 1 customer
  const deleteOtherCustRes = await request(app)
    .delete(`/api/customers/${sharedCustomer.id}`)
    .set('Authorization', `Bearer ${tokenOrg2}`);

  console.log(`DELETE customer of Org 1 from Org 2 user: HTTP ${deleteOtherCustRes.status}`);
  if (deleteOtherCustRes.status !== 404) throw new Error(`Expected 404 for cross-tenant DELETE, got ${deleteOtherCustRes.status}`);

  // Create Supplier in Org 1
  const createSupRes = await request(app)
    .post('/api/suppliers')
    .set('Authorization', `Bearer ${tokenShopA}`)
    .send({
      name: `Acme Direct Roasters ${Date.now()}`,
      contactPerson: 'David Mwangi',
      phone: '0733123456'
    });
  const sharedSupplier = createSupRes.body;

  // Org 2 user attempts to GET Org 1 supplier
  const getOtherSupRes = await request(app)
    .get(`/api/suppliers/${sharedSupplier.id}`)
    .set('Authorization', `Bearer ${tokenOrg2}`);

  console.log(`GET supplier of Org 1 from Org 2 user: HTTP ${getOtherSupRes.status}`);
  if (getOtherSupRes.status !== 404) throw new Error(`Expected 404 for cross-tenant supplier GET, got ${getOtherSupRes.status}`);

  console.log('✓ ITEM 4 PASSED: Cross-organization isolation is cryptographically enforced (all 404).\n');

  // ----------------------------------------------------
  // ITEM 5: FINDING-08 Dual Verification (Security Guard)
  // ----------------------------------------------------
  console.log('--- ITEM 5: FINDING-08 Dual Verification (Loyalty Points IDOR Guard) ---');
  // 5a: POSITIVE — Customer at Shop A, Shop B staff adjusts points
  const adjustPositiveRes = await request(app)
    .patch(`/api/customers/${sharedCustomer.id}/loyalty-points`)
    .set('Authorization', `Bearer ${tokenShopB}`)
    .send({ points: 50, reason: 'Cross branch loyalty redemption' });

  console.log(`5a POSITIVE: Adjust points from sibling branch (Shop B): HTTP ${adjustPositiveRes.status}`);
  if (adjustPositiveRes.status !== 200) {
    throw new Error(`Expected 200 for sibling branch loyalty adjustment, got ${adjustPositiveRes.status} ${JSON.stringify(adjustPositiveRes.body)}`);
  }
  const reloadedCustPositive = await Customer.findByPk(sharedCustomer.id);
  console.log(`Verified in DB: loyaltyPoints = ${reloadedCustPositive.loyaltyPoints}`);
  if (reloadedCustPositive.loyaltyPoints !== 50) throw new Error('Database loyalty points did not update to 50');

  // 5b: NEGATIVE — Attacker at Org 2 attempts to adjust loyalty points of Org 1 customer
  const adjustNegativeRes = await request(app)
    .patch(`/api/customers/${sharedCustomer.id}/loyalty-points`)
    .set('Authorization', `Bearer ${tokenOrg2}`)
    .send({ points: 999, reason: 'Malicious point injection' });

  console.log(`5b NEGATIVE: Adjust points from rival organization (Org 2): HTTP ${adjustNegativeRes.status}`);
  if (adjustNegativeRes.status !== 404) {
    throw new Error(`Expected 404 for cross-tenant loyalty adjustment attack, got ${adjustNegativeRes.status}`);
  }
  const reloadedCustNegative = await Customer.findByPk(sharedCustomer.id);
  console.log(`Verified in DB: loyaltyPoints remains UNCHANGED at ${reloadedCustNegative.loyaltyPoints}`);
  if (reloadedCustNegative.loyaltyPoints !== 50) throw new Error('Malicious points were injected!');

  console.log('✓ ITEM 5 PASSED: FINDING-08 loyalty adjustment correctly allows cross-branch operations while securely blocking cross-tenant IDOR.\n');

  // ----------------------------------------------------
  // ITEM 6: Walk-in customer auto-creation during a sale
  // ----------------------------------------------------
  console.log('--- ITEM 6: Walk-in Customer Auto-Creation Attribution ---');
  // Create product for sale
  const [cat] = await Category.findOrCreate({ where: { shopId: shopB.id }, defaults: { name: 'Groceries' } });
  const [saleProd] = await Product.findOrCreate({
    where: { sku: 'PROD-WALKIN-1002' },
    defaults: {
      name: 'Kenyan Tea',
      price: 250,
      cost: 150,
      stockQuantity: 100,
      categoryId: cat.id,
      shopId: shopB.id
    }
  });

  const walkinPhone = `0799${Math.floor(100000 + Math.random() * 900000)}`;
  const saleRes = await request(app)
    .post('/api/sales')
    .set('Authorization', `Bearer ${tokenShopB}`)
    .send({
      items: [{ productId: saleProd.id, quantity: 1, price: 250 }],
      total: 250,
      paymentAmount: 250,
      paymentMethod: 'cash',
      customerId: null,
      customer: {
        name: 'Grace Walkin',
        phone: walkinPhone,
        email: `grace_${Date.now()}@test.com`
      }
    });

  if (saleRes.status !== 201) {
    throw new Error(`Sale creation failed: ${saleRes.status} ${JSON.stringify(saleRes.body)}`);
  }
  console.log(`Sale created at Shop B: ID=${saleRes.body.sale.id}, CustomerId=${saleRes.body.sale.customerId}`);

  const autoCreatedCustomer = await Customer.findByPk(saleRes.body.sale.customerId);
  console.log('Auto-created customer record:', {
    id: autoCreatedCustomer.id,
    name: autoCreatedCustomer.name,
    organizationId: autoCreatedCustomer.organizationId,
    shopId: autoCreatedCustomer.shopId
  });

  if (autoCreatedCustomer.organizationId !== org100.id) {
    throw new Error(`Expected organizationId ${org100.id}, got ${autoCreatedCustomer.organizationId}`);
  }
  if (autoCreatedCustomer.shopId !== shopB.id) {
    throw new Error(`Expected origin shopId ${shopB.id}, got ${autoCreatedCustomer.shopId}`);
  }
  console.log('✓ ITEM 6 PASSED: Walk-in customer has organizationId and origin shopId correctly attributed.\n');

  // ----------------------------------------------------
  // ITEM 7: Supplier resolution during purchase
  // ----------------------------------------------------
  console.log('--- ITEM 7: Cross-Branch Supplier Resolution & Reuse ---');
  const supplierVendorName = `Kenya Breweries Corp ${Date.now()}`;

  // Resolve from Shop A
  const supA = await resolveSupplier({
    shopId: shopA.id,
    supplierName: supplierVendorName,
    supplierContact: '0711223344'
  });
  console.log(`Supplier resolved from Shop A: ID=${supA.id}, Name=${supA.name}, OrgId=${supA.organizationId}, ShopId=${supA.shopId}`);

  // Resolve from Shop B (sibling branch in same org)
  const supB = await resolveSupplier({
    shopId: shopB.id,
    supplierName: supplierVendorName,
    supplierContact: '0711223344'
  });
  console.log(`Supplier resolved from Shop B: ID=${supB.id}, Name=${supB.name}, OrgId=${supB.organizationId}, ShopId=${supB.shopId}`);

  if (supA.id !== supB.id) {
    throw new Error(`Expected supplier to be reused, but got duplicate IDs (${supA.id} vs ${supB.id})`);
  }
  console.log('Confirmed: same supplier record was reused without duplicating across branches.');
  console.log('✓ ITEM 7 PASSED: Supplier resolution reuses shared organization supplier across branches.\n');

  console.log('====================================================');
  console.log('ALL SPECIFICATION VERIFICATION CHECKS PASSED (2-8)!');
  console.log('====================================================');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
