'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  User,
  Product,
  Inventory
} = require('../src/models');
const jwt = require('jsonwebtoken');

function makeToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

async function verifyPrimary() {
  console.log('================================================================================');
  console.log('FINDING-12 SUB-PHASE 3A: PRIMARY DATABASE LIVE INTEGRATION & ISOLATION VERIFICATION');
  console.log('Target Database:', sequelize.config.database);
  console.log('================================================================================\n');

  let orgA, orgB, shopA1, shopA2, shopB1, userA, userB, memberA, memberB;
  let testProdId;

  try {
    await sequelize.authenticate();
    console.log('Connected to Primary DB:', sequelize.config.database);

    // 1. Setup isolated test fixtures in primary
    const timestamp = Date.now();
    orgA = await Organization.create({
      name: `Primary 3A Org Alpha ${timestamp}`,
      slug: `primary-3a-org-a-${timestamp}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Primary 3A Org Beta ${timestamp}`,
      slug: `primary-3a-org-b-${timestamp}`,
      status: 'active',
      currency: 'KES'
    });

    shopA1 = await Shop.create({
      name: `Shop Alpha 1 ${timestamp}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop Alpha 2 ${timestamp}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop Beta 1 ${timestamp}`,
      organizationId: orgB.id,
      active: true
    });

    userA = await User.create({
      name: 'Admin Alpha',
      email: `admin_a_${timestamp}@primaryverif.com`,
      password: 'password123',
      role: 'admin',
      shopId: shopA1.id,
      active: true
    });

    userB = await User.create({
      name: 'Admin Beta',
      email: `admin_b_${timestamp}@primaryverif.com`,
      password: 'password123',
      role: 'admin',
      shopId: shopB1.id,
      active: true
    });

    memberA = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: userA.id,
      orgRole: 'owner',
      status: 'active'
    });

    memberB = await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: userB.id,
      orgRole: 'owner',
      status: 'active'
    });

    const tokenA1 = makeToken({ id: userA.id, role: 'admin', shopId: shopA1.id, organizationId: orgA.id });
    const tokenA2 = makeToken({ id: userA.id, role: 'admin', shopId: shopA2.id, organizationId: orgA.id });
    const tokenB1 = makeToken({ id: userB.id, role: 'admin', shopId: shopB1.id, organizationId: orgB.id });

    // 2. Create catalog product in Org A
    const sku = `SKU-3A-PRI-${timestamp}`;
    const barcode = `BAR-3A-PRI-${timestamp}`;
    const prod = await Product.create({
      name: 'Primary Split Test Product',
      sku,
      barcode,
      price: 250.00,
      cost: 160.00,
      stockQuantity: 88,
      reorderPoint: 15,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });
    testProdId = prod.id;

    // Ensure Inventory row for Shop A1
    await Inventory.upsert({
      shopId: shopA1.id,
      productId: prod.id,
      stockQuantity: 88,
      reorderPoint: 15
    });

    // 3. Test Read Endpoints from Branch A1
    console.log('\n--- VERIFICATION 5: Read-Path Consistency on Primary ---');
    const resList = await request(app)
      .get(`/api/products?search=${sku}`)
      .set('Authorization', tokenA1);
    
    console.log('GET /api/products status:', resList.status);
    const listedItem = resList.body.products?.find(p => p.id === prod.id);
    console.log('Listed product stockQuantity:', listedItem?.stockQuantity, 'reorderPoint:', listedItem?.reorderPoint);

    const resOne = await request(app)
      .get(`/api/products/${prod.id}`)
      .set('Authorization', tokenA1);
    console.log('GET /api/products/:id status:', resOne.status);
    console.log('Single product stockQuantity:', resOne.body?.stockQuantity, 'reorderPoint:', resOne.body?.reorderPoint);

    const resBatch = await request(app)
      .get(`/api/products/batch?ids=${prod.id}`)
      .set('Authorization', tokenA1);
    console.log('GET /api/products/batch status:', resBatch.status);
    console.log('Batch product stockQuantity:', resBatch.body[0]?.stockQuantity);

    if (listedItem?.stockQuantity !== 88 || resOne.body?.stockQuantity !== 88 || resBatch.body[0]?.stockQuantity !== 88) {
      throw new Error(`Read path consistency failure on primary! Expected 88, got ${listedItem?.stockQuantity}`);
    }
    console.log('✓ Read-path consistency verified on primary: 88 units returned across all 3 read endpoints.');

    // 4. Test Cross-Branch Catalog Visibility & Branch Stock Isolation (Requirement 6)
    console.log('\n--- VERIFICATION 6: Cross-Branch Catalog Sharing & Stock Isolation on Primary ---');
    // Seed Shop A2 with different stock
    await Inventory.create({
      shopId: shopA2.id,
      productId: prod.id,
      stockQuantity: 14,
      reorderPoint: 4
    });

    const resOneA1 = await request(app).get(`/api/products/${prod.id}`).set('Authorization', tokenA1);
    const resOneA2 = await request(app).get(`/api/products/${prod.id}`).set('Authorization', tokenA2);

    console.log(`Branch A1 (Shop ${shopA1.id}) sees stock:`, resOneA1.body.stockQuantity);
    console.log(`Branch A2 (Shop ${shopA2.id}) sees stock:`, resOneA2.body.stockQuantity);
    console.log(`Catalog fields match (Name & SKU & Price):`, 
      resOneA1.body.name === resOneA2.body.name &&
      resOneA1.body.sku === resOneA2.body.sku &&
      resOneA1.body.price === resOneA2.body.price ? 'YES' : 'NO'
    );

    if (resOneA1.body.stockQuantity !== 88 || resOneA2.body.stockQuantity !== 14) {
      throw new Error(`Cross-branch stock isolation failure! Branch A1: ${resOneA1.body.stockQuantity}, Branch A2: ${resOneA2.body.stockQuantity}`);
    }
    console.log('✓ Cross-branch catalog sharing and stock isolation verified on primary.');

    // 5. Cross-Org Isolation Guard
    console.log('\n--- Cross-Tenant Isolation Guard on Primary ---');
    const resOrgB = await request(app).get(`/api/products/${prod.id}`).set('Authorization', tokenB1);
    console.log('GET Org A product by Org B user status (expected 404):', resOrgB.status);
    if (resOrgB.status !== 404) {
      throw new Error(`Cross-tenant security violation! Expected 404, got ${resOrgB.status}`);
    }
    console.log('✓ Cross-tenant security isolation verified: 404 returned.');

    console.log('\n================================================================================');
    console.log('ALL PRIMARY INTEGRATION & READ-PATH CHECKS PASSED!');
    console.log('================================================================================');

  } catch (err) {
    console.error('PRIMARY VERIFICATION FAILED:', err);
    process.exitCode = 1;
  } finally {
    console.log('\n--- Cleaning up temporary primary fixtures ---');
    try {
      if (testProdId) {
        await Inventory.destroy({ where: { productId: testProdId } });
        await Product.destroy({ where: { id: testProdId } });
      }
      if (memberA?.id) await OrganizationMembership.destroy({ where: { id: memberA.id } });
      if (memberB?.id) await OrganizationMembership.destroy({ where: { id: memberB.id } });
      if (userA?.id) await User.destroy({ where: { id: userA.id } });
      if (userB?.id) await User.destroy({ where: { id: userB.id } });
      if (shopA1?.id) await Shop.destroy({ where: { id: shopA1.id } });
      if (shopA2?.id) await Shop.destroy({ where: { id: shopA2.id } });
      if (shopB1?.id) await Shop.destroy({ where: { id: shopB1.id } });
      if (orgA?.id) await Organization.destroy({ where: { id: orgA.id } });
      if (orgB?.id) await Organization.destroy({ where: { id: orgB.id } });
      console.log('Cleanup completed successfully.');
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    } finally {
      await sequelize.close();
      process.exit(process.exitCode || 0);
    }
  }
}

verifyPrimary();
