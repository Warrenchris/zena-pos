'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Product,
  Category,
  Inventory,
  Purchase,
  PurchaseItem,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Expense,
  StockMovement,
  Plan,
  Subscription
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');

function tokenFor(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  const jti = payload.jti || crypto.randomUUID();
  const iat = payload.iat || Math.floor(Date.now() / 1000);
  return 'Bearer ' + jwt.sign({ jti, iat, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Gate 3D: Purchases & Suppliers Domain Authorization Migration Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerEmployeeA1, managerEmployeeA2, cashierEmployeeA1;
  let ownerUserB;
  let planEnterprise;
  let categoryA, productA1, productA2, productB;
  let supplierA1, supplierA2, supplierB1;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Subscription Plan with unlimited quotas
    [planEnterprise] = await Plan.findOrCreate({
      where: { code: 'enterprise_gate3d' },
      defaults: {
        name: 'Enterprise Gate 3D',
        code: 'enterprise_gate3d',
        price: 9999,
        interval: 'monthly',
        maxUsers: 1000,
        maxShops: 100,
        maxProducts: 10000,
        features: ['all']
      }
    });

    // 2. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Purchases ${ts}`,
      slug: `org-a-purchases-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Purchases ${ts}`,
      slug: `org-b-purchases-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // Subscriptions
    await Subscription.create({
      organizationId: orgA.id,
      planId: planEnterprise.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    await Subscription.create({
      organizationId: orgB.id,
      planId: planEnterprise.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    // 3. Setup Shops
    shopA1 = await Shop.create({
      name: `Shop A1 Purchases ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 Purchases ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 Purchases ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // 4. Products & Categories
    categoryA = await Category.create({
      name: `Cat A ${ts}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      price: 100.00,
      cost: 50.00,
      shopId: shopA1.id,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    productA2 = await Product.create({
      name: `Product A2 ${ts}`,
      sku: `SKU-A2-${ts}`,
      price: 150.00,
      cost: 70.00,
      shopId: shopA2.id,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    productB = await Product.create({
      name: `Product B ${ts}`,
      sku: `SKU-B-${ts}`,
      price: 200.00,
      cost: 100.00,
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true
    });

    await Inventory.create({
      productId: productA1.id,
      shopId: shopA1.id,
      stockQuantity: 50,
      reorderPoint: 10
    });

    await Inventory.create({
      productId: productA2.id,
      shopId: shopA2.id,
      stockQuantity: 50,
      reorderPoint: 10
    });

    await Inventory.create({
      productId: productB.id,
      shopId: shopB1.id,
      stockQuantity: 50,
      reorderPoint: 10
    });

    // 5. Suppliers
    supplierA1 = await Supplier.create({
      name: `Supplier A1 ${ts}`,
      organizationId: orgA.id,
      shopId: shopA1.id,
      contactPerson: 'Vendor A1 Contact',
      email: `vendorA1_${ts}@test.com`,
      phone: '0711000001'
    });

    supplierA2 = await Supplier.create({
      name: `Supplier A2 Unused ${ts}`,
      organizationId: orgA.id,
      shopId: shopA1.id,
      contactPerson: 'Vendor A2 Unused',
      email: `vendorA2_${ts}@test.com`,
      phone: '0711000002'
    });

    supplierB1 = await Supplier.create({
      name: `Supplier B1 ${ts}`,
      organizationId: orgB.id,
      shopId: shopB1.id,
      contactPerson: 'Vendor B1 Contact',
      email: `vendorB1_${ts}@test.com`,
      phone: '0722000001'
    });

    // 6. Users & Memberships
    // Owner User A
    ownerUserA = await User.create({
      name: `Owner A ${ts}`,
      email: `owner.purchases.${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Manager Employee A1 (assigned only to shopA1)
    managerEmployeeA1 = await Employee.create({
      firstName: 'Manager',
      lastName: `A1 ${ts}`,
      email: `mgr.purchases.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 50000,
      position: 'Manager',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const mgrMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: mgrMemA1.id,
      shopId: shopA1.id,
      role: 'manager'
    });

    // Manager Employee A2 (assigned only to shopA2)
    managerEmployeeA2 = await Employee.create({
      firstName: 'Manager',
      lastName: `A2 ${ts}`,
      email: `mgr.purchases.a2.${ts}@example.com`,
      password: 'Password123!',
      salary: 50000,
      position: 'Manager',
      status: 'active',
      shopId: shopA2.id,
      authzVersion: 1
    });

    const mgrMemA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA2.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: mgrMemA2.id,
      shopId: shopA2.id,
      role: 'manager'
    });

    // Cashier Employee A1 (assigned only to shopA1)
    cashierEmployeeA1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A1 ${ts}`,
      email: `cashier.purchases.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 30000,
      position: 'Cashier',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const cashierMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: cashierMemA1.id,
      shopId: shopA1.id,
      role: 'cashier'
    });

    // Owner User B (Org B)
    ownerUserB = await User.create({
      name: `Owner B ${ts}`,
      email: `owner.purchases.b.${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB1.id,
      active: true,
      authzVersion: 1,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: ownerUserB.id,
      orgRole: 'owner',
      status: 'active'
    });
  });

  afterAll(async () => {
    try {
      await PurchaseItem.destroy({ where: {} });
      await Purchase.destroy({ where: {} });
      await PurchaseOrderItem.destroy({ where: {} });
      await PurchaseOrder.destroy({ where: {} });
      await Expense.destroy({ where: {} });
      await StockMovement.destroy({ where: {} });
      await Inventory.destroy({ where: {} });
      await Product.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Supplier.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Category.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await ShopAccess.destroy({ where: {} });
      await OrganizationMembership.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Employee.destroy({ where: { id: [managerEmployeeA1.id, managerEmployeeA2.id, cashierEmployeeA1.id] } });
      await User.destroy({ where: { id: [ownerUserA.id, ownerUserB.id] } });
      await Subscription.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Shop.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Organization.destroy({ where: { id: [orgA.id, orgB.id] } });
    } catch (e) {
      // cleanup best effort
    }
  });

  // --------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION & EPOCH ENFORCEMENT
  // --------------------------------------------------------------------------
  describe('1. Authentication & Epoch Enforcement', () => {
    it('1.1: rejects requests with missing Authorization header (401)', async () => {
      const resPur = await request(app).get('/api/purchases');
      expect(resPur.status).toBe(401);

      const resPo = await request(app).get('/api/purchase-orders');
      expect(resPo.status).toBe(401);

      const resSup = await request(app).get('/api/suppliers');
      expect(resSup.status).toBe(401);
    });

    it('1.2: rejects token with invalid signature (401)', async () => {
      const validToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });
      const invalidToken = `Bearer ${validToken.slice(0, -10)}badbadbadb`;
      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', invalidToken);
      expect(res.status).toBe(401);
    });

    it('1.3: rejects revoked token JTI (401)', async () => {
      const jti = crypto.randomUUID();
      const token = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1,
        jti
      });

      await tokenRevocationService.revokeToken(jti, 3600);

      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', token);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/revoked/i);
    });

    it('1.4: rejects token with stale authzVersion (401 AUTHZ_VERSION_STALE)', async () => {
      const staleToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 0 // stale: active DB is at least 1
      });

      const res = await request(app)
        .get('/api/purchases')
        .set('Authorization', staleToken);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    it('1.5: rejects token without shop context on branch endpoints (403 Shop context required)', async () => {
      const noShopToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      const resPur = await request(app)
        .get('/api/purchases')
        .set('Authorization', noShopToken);
      expect(resPur.status).toBe(403);
      expect(resPur.body.error).toMatch(/Shop context required/i);

      const resPo = await request(app)
        .get('/api/purchase-orders')
        .set('Authorization', noShopToken);
      expect(resPo.status).toBe(403);
      expect(resPo.body.error).toMatch(/Shop context required/i);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 2: MULTI-TENANT ISOLATION (ANTI-ORACLE VERIFICATION)
  // --------------------------------------------------------------------------
  describe('2. Multi-Tenant Isolation & Anti-Oracle Masking', () => {
    let testPurchaseA, testPoA;

    beforeAll(async () => {
      testPurchaseA = await Purchase.create({
        shopId: shopA1.id,
        referenceNo: `PUR-TEST-ISO-${Date.now()}`,
        supplierId: supplierA1.id,
        supplierName: supplierA1.name,
        totalAmount: 500.00,
        paidAmount: 500.00,
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        items: [{ productId: productA1.id, quantity: 5, unitCost: 100.00, totalCost: 500.00 }]
      });

      testPoA = await PurchaseOrder.create({
        shopId: shopA1.id,
        poNumber: `PO-TEST-ISO-${Date.now()}`,
        supplierId: supplierA1.id,
        supplierName: supplierA1.name,
        totalAmount: 1000.00,
        status: 'ORDERED',
        items: [{ productId: productA1.id, quantityOrdered: 10, unitCost: 100.00, subtotal: 1000.00 }]
      });
    });

    it('2.1: Org B admin cannot read Org A purchase (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .get(`/api/purchases/${testPurchaseA.id}`)
        .set('Authorization', tokenB);
      expect(res.status).toBe(404);
    });

    it('2.2: Org B admin cannot update Org A purchase (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .put(`/api/purchases/${testPurchaseA.id}`)
        .set('Authorization', tokenB)
        .send({ notes: 'Tampered notes' });
      expect(res.status).toBe(404);
    });

    it('2.3: Org B admin cannot cancel Org A purchase (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .patch(`/api/purchases/${testPurchaseA.id}/cancel`)
        .set('Authorization', tokenB);
      expect(res.status).toBe(404);
    });

    it('2.4: Org B admin cannot delete Org A purchase (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .delete(`/api/purchases/${testPurchaseA.id}`)
        .set('Authorization', tokenB);
      expect(res.status).toBe(404);
    });

    it('2.5: Org B admin cannot read Org A purchase order (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .get(`/api/purchase-orders/${testPoA.id}`)
        .set('Authorization', tokenB);
      expect(res.status).toBe(404);
    });

    it('2.6: Org B admin cannot receive or cancel Org A PO (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const recRes = await request(app)
        .patch(`/api/purchase-orders/${testPoA.id}/receive`)
        .set('Authorization', tokenB)
        .send({ receivedItems: [{ productId: productA1.id, quantityToReceive: 5 }] });
      expect(recRes.status).toBe(404);

      const cancelRes = await request(app)
        .patch(`/api/purchase-orders/${testPoA.id}/cancel`)
        .set('Authorization', tokenB);
      expect(cancelRes.status).toBe(404);
    });

    it('2.7: Org B admin cannot delete Org A PO (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .delete(`/api/purchase-orders/${testPoA.id}`)
        .set('Authorization', tokenB);
      expect(res.status).toBe(404);
    });

    it('2.8: Org B admin cannot read Org A supplier details (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .get(`/api/suppliers/${supplierA1.id}`)
        .set('Authorization', tokenB);
      expect(res.status).toBe(404);
    });

    it('2.9: Org B admin cannot update or delete Org A supplier (404 anti-oracle)', async () => {
      const tokenB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });

      const putRes = await request(app)
        .put(`/api/suppliers/${supplierA1.id}`)
        .set('Authorization', tokenB)
        .send({ name: 'Tampered Supplier' });
      expect(putRes.status).toBe(404);

      const delRes = await request(app)
        .delete(`/api/suppliers/${supplierA1.id}`)
        .set('Authorization', tokenB);
      expect(delRes.status).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 3: CROSS-BRANCH ISOLATION
  // --------------------------------------------------------------------------
  describe('3. Cross-Branch Scope Isolation', () => {
    let testPurchaseShop2, testPoShop2;

    beforeAll(async () => {
      testPurchaseShop2 = await Purchase.create({
        shopId: shopA2.id,
        referenceNo: `PUR-SHOP2-${Date.now()}`,
        supplierId: supplierA1.id,
        supplierName: supplierA1.name,
        totalAmount: 300.00,
        paidAmount: 300.00,
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        items: [{ productId: productA2.id, quantity: 3, unitCost: 100.00, totalCost: 300.00 }]
      });

      testPoShop2 = await PurchaseOrder.create({
        shopId: shopA2.id,
        poNumber: `PO-SHOP2-${Date.now()}`,
        supplierId: supplierA1.id,
        supplierName: supplierA1.name,
        totalAmount: 600.00,
        status: 'ORDERED',
        items: [{ productId: productA2.id, quantityOrdered: 6, unitCost: 100.00, subtotal: 600.00 }]
      });
    });

    it('3.1: Manager assigned only to Shop A1 cannot read Shop A2 purchase (404)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .get(`/api/purchases/${testPurchaseShop2.id}`)
        .set('Authorization', tokenMgrA1);
      expect(res.status).toBe(404);
    });

    it('3.2: Manager assigned only to Shop A1 cannot read Shop A2 PO (404)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .get(`/api/purchase-orders/${testPoShop2.id}`)
        .set('Authorization', tokenMgrA1);
      expect(res.status).toBe(404);
    });

    it('3.3: Manager assigned only to Shop A1 cannot create purchase in Shop A2 (403)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', tokenMgrA1)
        .send({
          shopId: shopA2.id, // Targeting unauthorized branch
          supplierName: 'Vendor',
          items: [{ productId: productA2.id, quantity: 2, unitCost: 50.00 }]
        });
      expect(res.status).toBe(403);
    });

    it('3.4: Manager assigned only to Shop A1 cannot create PO in Shop A2 (403)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', tokenMgrA1)
        .send({
          shopId: shopA2.id, // Targeting unauthorized branch
          supplierName: 'Vendor',
          items: [{ productId: productA2.id, quantityOrdered: 5, unitCost: 50.00 }]
        });
      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 4: PRIVILEGE ESCALATION & ROLE BOUNDARIES
  // --------------------------------------------------------------------------
  describe('4. Privilege Escalation & Role Boundaries', () => {
    let testPurchase, testPo;

    beforeAll(async () => {
      testPurchase = await Purchase.create({
        shopId: shopA1.id,
        referenceNo: `PUR-RBAC-${Date.now()}`,
        supplierId: supplierA1.id,
        supplierName: supplierA1.name,
        totalAmount: 200.00,
        paidAmount: 200.00,
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        items: [{ productId: productA1.id, quantity: 2, unitCost: 100.00, totalCost: 200.00 }]
      });

      testPo = await PurchaseOrder.create({
        shopId: shopA1.id,
        poNumber: `PO-RBAC-${Date.now()}`,
        supplierId: supplierA1.id,
        supplierName: supplierA1.name,
        totalAmount: 400.00,
        status: 'ORDERED',
        items: [{ productId: productA1.id, quantityOrdered: 4, unitCost: 100.00, subtotal: 400.00 }]
      });
    });

    it('4.1: Cashier cannot list or view purchases (403)', async () => {
      const tokenCashier = tokenFor({
        id: cashierEmployeeA1.id,
        role: 'cashier',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const listRes = await request(app)
        .get('/api/purchases')
        .set('Authorization', tokenCashier);
      expect(listRes.status).toBe(403);

      const viewRes = await request(app)
        .get(`/api/purchases/${testPurchase.id}`)
        .set('Authorization', tokenCashier);
      expect(viewRes.status).toBe(403);
    });

    it('4.2: Cashier cannot create purchase (403)', async () => {
      const tokenCashier = tokenFor({
        id: cashierEmployeeA1.id,
        role: 'cashier',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', tokenCashier)
        .send({
          supplierName: 'Unauthorized Vendor',
          items: [{ productId: productA1.id, quantity: 2, unitCost: 50.00 }]
        });
      expect(res.status).toBe(403);
    });

    it('4.3: Cashier cannot cancel or delete purchase (403)', async () => {
      const tokenCashier = tokenFor({
        id: cashierEmployeeA1.id,
        role: 'cashier',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const cancelRes = await request(app)
        .patch(`/api/purchases/${testPurchase.id}/cancel`)
        .set('Authorization', tokenCashier);
      expect(cancelRes.status).toBe(403);

      const delRes = await request(app)
        .delete(`/api/purchases/${testPurchase.id}`)
        .set('Authorization', tokenCashier);
      expect(delRes.status).toBe(403);
    });

    it('4.4: Cashier cannot list, create, or receive POs (403)', async () => {
      const tokenCashier = tokenFor({
        id: cashierEmployeeA1.id,
        role: 'cashier',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const listRes = await request(app)
        .get('/api/purchase-orders')
        .set('Authorization', tokenCashier);
      expect(listRes.status).toBe(403);

      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', tokenCashier)
        .send({
          supplierName: 'Vendor',
          items: [{ productId: productA1.id, quantityOrdered: 2, unitCost: 50.00 }]
        });
      expect(createRes.status).toBe(403);

      const recRes = await request(app)
        .patch(`/api/purchase-orders/${testPo.id}/receive`)
        .set('Authorization', tokenCashier)
        .send({ receivedItems: [{ productId: productA1.id, quantityToReceive: 2 }] });
      expect(recRes.status).toBe(403);
    });

    it('4.5: Cashier cannot access suppliers endpoints (403)', async () => {
      const tokenCashier = tokenFor({
        id: cashierEmployeeA1.id,
        role: 'cashier',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const listRes = await request(app)
        .get('/api/suppliers')
        .set('Authorization', tokenCashier);
      expect(listRes.status).toBe(403);

      const viewRes = await request(app)
        .get(`/api/suppliers/${supplierA1.id}`)
        .set('Authorization', tokenCashier);
      expect(viewRes.status).toBe(403);

      const createRes = await request(app)
        .post('/api/suppliers')
        .set('Authorization', tokenCashier)
        .send({ name: 'Unauthorized Supplier' });
      expect(createRes.status).toBe(403);
    });

    it('4.6: Manager cannot delete purchase (requires governance admin: 403)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .delete(`/api/purchases/${testPurchase.id}`)
        .set('Authorization', tokenMgrA1);
      expect(res.status).toBe(403);
    });

    it('4.7: Manager cannot cancel purchase (requires governance admin: 403)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .patch(`/api/purchases/${testPurchase.id}/cancel`)
        .set('Authorization', tokenMgrA1);
      expect(res.status).toBe(403);
    });

    it('4.8: Manager cannot delete PO (requires governance admin: 403)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .delete(`/api/purchase-orders/${testPo.id}`)
        .set('Authorization', tokenMgrA1);
      expect(res.status).toBe(403);
    });

    it('4.9: Manager cannot delete supplier (requires governance admin: 403)', async () => {
      const tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .delete(`/api/suppliers/${supplierA2.id}`)
        .set('Authorization', tokenMgrA1);
      expect(res.status).toBe(403);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 5: DATA INTEGRITY & CROSS-TENANT ASSOCIATION
  // --------------------------------------------------------------------------
  describe('5. Data Integrity & Cross-Tenant Association Defense', () => {
    let tokenOwnerA;

    beforeAll(() => {
      tokenOwnerA = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });
    });

    it('5.1: rejects purchase creation with cross-tenant supplierId (404)', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', tokenOwnerA)
        .send({
          supplierId: supplierB1.id, // Org B supplier
          supplierName: supplierB1.name,
          items: [{ productId: productA1.id, quantity: 5, unitCost: 50.00 }]
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('5.2: rejects PO creation with cross-tenant supplierId (404)', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', tokenOwnerA)
        .send({
          supplierId: supplierB1.id, // Org B supplier
          supplierName: supplierB1.name,
          items: [{ productId: productA1.id, quantityOrdered: 10, unitCost: 50.00 }]
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('5.3: rejects purchase creation with cross-tenant productId (404)', async () => {
      const res = await request(app)
        .post('/api/purchases')
        .set('Authorization', tokenOwnerA)
        .send({
          supplierName: 'Vendor Local',
          items: [{ productId: productB.id, quantity: 5, unitCost: 50.00 }] // Org B product
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('5.4: rejects PO creation with cross-tenant productId (404)', async () => {
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', tokenOwnerA)
        .send({
          supplierName: 'Vendor Local',
          items: [{ productId: productB.id, quantityOrdered: 5, unitCost: 50.00 }] // Org B product
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('5.5: blocks deleting supplier with existing purchase history (400)', async () => {
      // supplierA1 has purchases
      const res = await request(app)
        .delete(`/api/suppliers/${supplierA1.id}`)
        .set('Authorization', tokenOwnerA);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/existing purchase/i);
    });

    it('5.6: allows Org Admin to delete unused supplier (200)', async () => {
      // supplierA2 is unused
      const res = await request(app)
        .delete(`/api/suppliers/${supplierA2.id}`)
        .set('Authorization', tokenOwnerA);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted successfully/i);

      // Verify deletion in DB
      const check = await Supplier.findByPk(supplierA2.id);
      expect(check).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 6: OPERATIONAL WORKFLOWS & FINANCIAL VISIBILITY
  // --------------------------------------------------------------------------
  describe('6. Operational Workflows & Financial Reconciliation', () => {
    let tokenOwnerA, tokenMgrA1;

    beforeAll(() => {
      tokenOwnerA = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      tokenMgrA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });
    });

    it('6.1: Manager creates PO in Shop A1, receives goods, auto-creates Purchase, updates inventory', async () => {
      const initialInv = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA1.id } });
      const initialStock = parseFloat(initialInv.stockQuantity);

      // 1. Create PO
      const createRes = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', tokenMgrA1)
        .send({
          supplierName: 'Fresh Farms Ltd',
          items: [{ productId: productA1.id, quantityOrdered: 20, unitCost: 45.00 }]
        });

      expect(createRes.status).toBe(201);
      const poId = createRes.body.id;
      expect(createRes.body.status).toBe('ORDERED');

      // 2. Receive PO goods
      const recRes = await request(app)
        .patch(`/api/purchase-orders/${poId}/receive`)
        .set('Authorization', tokenMgrA1)
        .send({
          receivedItems: [{ productId: productA1.id, quantityToReceive: 20 }]
        });

      expect(recRes.status).toBe(200);
      expect(recRes.body.status).toBe('RECEIVED');

      // 3. Verify stock increased in Inventory
      const updatedInv = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA1.id } });
      expect(parseFloat(updatedInv.stockQuantity)).toBe(initialStock + 20);

      // 4. Verify linked Purchase was auto-generated
      const generatedPur = await Purchase.findOne({
        where: { notes: { [require('sequelize').Op.like]: `%${recRes.body.poNumber}%` }, shopId: shopA1.id }
      });
      expect(generatedPur).not.toBeNull();
      expect(generatedPur.status).toBe('RECEIVED');
    });

    it('6.2: Org Admin creates partial purchase, records payments, and reconciles balance', async () => {
      const createRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', tokenOwnerA)
        .send({
          supplierName: 'Capital Importers Ltd',
          status: 'PENDING',
          paymentStatus: 'PARTIAL',
          paidAmount: 200.00,
          paymentMethod: 'BANK TRANSFER',
          items: [{ productId: productA1.id, quantity: 10, unitCost: 60.00 }] // Total = 600.00
        });

      expect(createRes.status).toBe(201);
      const purchaseId = createRes.body.id;
      expect(Number(createRes.body.totalAmount)).toBe(600.00);
      expect(Number(createRes.body.paidAmount)).toBe(200.00);

      // Record remaining payment
      const payRes = await request(app)
        .post(`/api/purchases/${purchaseId}/payments`)
        .set('Authorization', tokenOwnerA)
        .send({ amount: 400.00, paymentMethod: 'CASH' });

      expect(payRes.status).toBe(200);
      expect(payRes.body.paymentStatus).toBe('PAID');
      expect(Number(payRes.body.outstandingBalance)).toBe(0.00);

      // Verify Expense entries exist in Expenses table
      const expenses = await Expense.findAll({
        where: { reference: createRes.body.referenceNo, shopId: shopA1.id }
      });
      expect(expenses.length).toBe(2);
      const totalExpense = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
      expect(totalExpense).toBe(600.00);
    });

    it('6.3: Org Admin cancels received purchase and atomically reverses stock', async () => {
      // 1. Create received purchase
      const createRes = await request(app)
        .post('/api/purchases')
        .set('Authorization', tokenOwnerA)
        .send({
          supplierName: 'Reversal Test Vendor',
          status: 'RECEIVED',
          paymentStatus: 'PAID',
          items: [{ productId: productA1.id, quantity: 15, unitCost: 50.00 }]
        });

      expect(createRes.status).toBe(201);
      const pId = createRes.body.id;

      const invBefore = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA1.id } });
      const stockBefore = parseFloat(invBefore.stockQuantity);

      // 2. Cancel purchase
      const cancelRes = await request(app)
        .patch(`/api/purchases/${pId}/cancel`)
        .set('Authorization', tokenOwnerA);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.purchase.status).toBe('CANCELLED');

      // 3. Verify stock decreased by 15
      const invAfter = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA1.id } });
      expect(parseFloat(invAfter.stockQuantity)).toBe(stockBefore - 15);
    });

    it('6.4: Org Admin creates and updates a supplier, lists suppliers within tenant', async () => {
      const createRes = await request(app)
        .post('/api/suppliers')
        .set('Authorization', tokenOwnerA)
        .send({
          name: 'Nairobi Central Agro Supplies',
          contactPerson: 'Agro Rep',
          email: 'agro@nairobi.com',
          phone: '0700112233',
          address: 'CBD Warehouse 4'
        });

      expect(createRes.status).toBe(201);
      const supId = createRes.body.id;

      // Update supplier
      const updateRes = await request(app)
        .put(`/api/suppliers/${supId}`)
        .set('Authorization', tokenOwnerA)
        .send({
          contactPerson: 'Chief Agro Rep',
          phone: '0700998877'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.contactPerson).toBe('Chief Agro Rep');
      expect(updateRes.body.phone).toBe('0700998877');

      // List suppliers
      const listRes = await request(app)
        .get('/api/suppliers?search=Agro')
        .set('Authorization', tokenOwnerA);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.some(s => s.id === supId)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // SECTION 7: EPOCH REVOCATION / MUTATION PROPAGATION
  // --------------------------------------------------------------------------
  describe('7. Epoch Mutation Propagation', () => {
    it('7.1: incrementing authzVersion invalidates active token immediately', async () => {
      const activeToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      // 1. Verify token works
      const resBefore = await request(app)
        .get('/api/purchases')
        .set('Authorization', activeToken);
      expect(resBefore.status).toBe(200);

      // 2. Bump user authzVersion in DB and Redis
      await tokenRevocationService.incrementAuthzVersion(ownerUserA.id, false);

      // 3. Verify previously active token is now rejected with 401
      const resAfter = await request(app)
        .get('/api/purchases')
        .set('Authorization', activeToken);
      expect(resAfter.status).toBe(401);
      expect(resAfter.body.code).toBe('AUTHZ_VERSION_STALE');
    });
  });
});
