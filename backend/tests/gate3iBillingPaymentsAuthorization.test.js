'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Employee,
  Shop,
  ShopAccess,
  Organization,
  OrganizationMembership,
  Plan,
  Subscription,
  SubscriptionInvoice,
  PendingPayment,
  Sale
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const mpesaService = require('../src/services/mpesaService');
const cardPaymentService = require('../src/services/cardPaymentService');

jest.mock('../src/services/mpesaService', () => {
  const actual = jest.requireActual('../src/services/mpesaService');
  return {
    ...actual,
    initiateStkPush: jest.fn(),
    queryStkPushStatus: jest.fn()
  };
});
jest.mock('../src/services/cardPaymentService');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '1h'
  });
}

describe('Gate 3I: Billing, Subscriptions & Payments Authorization Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, ownerUserB;
  let adminEmployeeA1;
  let managerEmployeeA1;
  let cashierEmployeeA1, cashierEmployeeA2;
  let cashierEmployeeB1;
  let ownerTokenA, ownerTokenB;
  let adminTokenA1;
  let managerTokenA1;
  let cashierTokenA1, cashierTokenA2;
  let cashierTokenB1;
  let starterPlan, proPlan;
  let subA, subB;
  let invoiceA1, invoiceA2, invoiceB1;
  let pendingMpesaA1, pendingCardA1;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Use seeded plans so we do not pollute public plan catalog
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    proPlan = await Plan.findOne({ where: { code: 'pro' } });

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Gate 3I ${ts}`,
      slug: `org-a-gate3i-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Gate 3I ${ts}`,
      slug: `org-b-gate3i-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // 2. Setup Shops
    shopA1 = await Shop.create({
      name: `Shop A1 Gate 3I ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 Gate 3I ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 Gate 3I ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // 3. Subscriptions
    subA = await Subscription.create({
      organizationId: orgA.id,
      planId: proPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59')
    });

    subB = await Subscription.create({
      organizationId: orgB.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59')
    });

    // 4. Setup Users & Employees
    // Org A Owner
    ownerUserA = await User.create({
      name: `Owner A ${ts}`,
      email: `owner.a.${ts}@example.com`,
      password: 'HashedPassword123!',
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Org B Owner
    ownerUserB = await User.create({
      name: `Owner B ${ts}`,
      email: `owner.b.${ts}@example.com`,
      password: 'HashedPassword123!',
      role: 'admin',
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: ownerUserB.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Org A Delegated Admin (employee with orgRole='admin')
    adminEmployeeA1 = await Employee.create({
      firstName: 'Delegated',
      lastName: `Admin A1 ${ts}`,
      email: `admin.a1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 50000,
      position: 'manager',
      status: 'active',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memAdminA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: adminEmployeeA1.id,
      orgRole: 'admin',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memAdminA1.id,
      shopId: shopA1.id,
      role: 'manager'
    });

    // Org A Manager
    managerEmployeeA1 = await Employee.create({
      firstName: 'Manager',
      lastName: `A1 ${ts}`,
      email: `manager.a1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 40000,
      position: 'manager',
      status: 'active',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memManagerA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memManagerA1.id,
      shopId: shopA1.id,
      role: 'manager'
    });

    // Org A Cashier 1 (assigned to shopA1)
    cashierEmployeeA1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A1 ${ts}`,
      email: `cashier.a1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 20000,
      position: 'cashier',
      status: 'active',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memCashierA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memCashierA1.id,
      shopId: shopA1.id,
      role: 'cashier'
    });

    // Org A Cashier 2 (assigned to shopA2)
    cashierEmployeeA2 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A2 ${ts}`,
      email: `cashier.a2.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 20000,
      position: 'cashier',
      status: 'active',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memCashierA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA2.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memCashierA2.id,
      shopId: shopA2.id,
      role: 'cashier'
    });

    // Org B Cashier (assigned to shopB1)
    cashierEmployeeB1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `B1 ${ts}`,
      email: `cashier.b1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 20000,
      position: 'cashier',
      status: 'active',
      shopId: shopB1.id,
      organizationId: orgB.id,
      isActive: true,
      authzVersion: 1
    });

    const memCashierB1 = await OrganizationMembership.create({
      organizationId: orgB.id,
      employeeId: cashierEmployeeB1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memCashierB1.id,
      shopId: shopB1.id,
      role: 'cashier'
    });

    // Tokens
    ownerTokenA = tokenFor({
      id: ownerUserA.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1,
      isEmployee: false
    });

    ownerTokenB = tokenFor({
      id: ownerUserB.id,
      role: 'admin',
      shopId: shopB1.id,
      organizationId: orgB.id,
      authzVersion: 1,
      isEmployee: false
    });

    adminTokenA1 = tokenFor({
      id: adminEmployeeA1.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1,
      isEmployee: true
    });

    managerTokenA1 = tokenFor({
      id: managerEmployeeA1.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1,
      isEmployee: true
    });

    cashierTokenA1 = tokenFor({
      id: cashierEmployeeA1.id,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1,
      isEmployee: true
    });

    cashierTokenA2 = tokenFor({
      id: cashierEmployeeA2.id,
      role: 'cashier',
      shopId: shopA2.id,
      organizationId: orgA.id,
      authzVersion: 1,
      isEmployee: true
    });

    cashierTokenB1 = tokenFor({
      id: cashierEmployeeB1.id,
      role: 'cashier',
      shopId: shopB1.id,
      organizationId: orgB.id,
      authzVersion: 1,
      isEmployee: true
    });

    // 5. Invoices
    invoiceA1 = await SubscriptionInvoice.create({
      organizationId: orgA.id,
      subscriptionId: subA.id,
      planId: proPlan.id,
      invoiceNumber: `INV-SUB-A1-${ts}`,
      amount: 4500,
      currency: 'KES',
      status: 'paid',
      paymentChannel: 'mpesa',
      paidAt: new Date()
    });

    invoiceA2 = await SubscriptionInvoice.create({
      organizationId: orgA.id,
      subscriptionId: subA.id,
      planId: proPlan.id,
      invoiceNumber: `INV-SUB-A2-${ts}`,
      amount: 4500,
      currency: 'KES',
      status: 'pending',
      paymentChannel: 'card'
    });

    invoiceB1 = await SubscriptionInvoice.create({
      organizationId: orgB.id,
      subscriptionId: subB.id,
      planId: starterPlan.id,
      invoiceNumber: `INV-SUB-B1-${ts}`,
      amount: 1500,
      currency: 'KES',
      status: 'paid',
      paymentChannel: 'mpesa',
      paidAt: new Date()
    });

    // 6. Pending Payments
    pendingMpesaA1 = await PendingPayment.create({
      checkoutRequestId: `ws_CO_GATE3I_MPESA_${ts}`,
      orderId: `ORD_MPESA_${ts}`,
      shopId: shopA1.id,
      amount: 500,
      status: 'pending',
      paymentChannel: 'mpesa',
      saleData: {
        items: [{ productId: 1, quantity: 1, unitPrice: 500 }],
        callbackToken: `token_mpesa_${ts}`
      }
    });

    pendingCardA1 = await PendingPayment.create({
      checkoutRequestId: `CARD_REF_GATE3I_${ts}`,
      orderId: `ORD_CARD_${ts}`,
      shopId: shopA1.id,
      amount: 1200,
      status: 'pending',
      paymentChannel: 'card',
      saleData: {
        currency: 'KES',
        organizationId: orgA.id,
        items: [{ productId: 1, quantity: 1, unitPrice: 1200 }]
      }
    });
  });

  // =========================================================================
  // 1. Authentication & Epoch Invalidation
  // =========================================================================
  describe('1. Authentication & Epoch Invalidation', () => {
    it('1.1: Request missing Authorization header returns 401', async () => {
      const res = await request(app).get('/api/billing/subscription');
      expect(res.status).toBe(401);
    });

    it('1.2: Request with malformed / invalid signature token returns 401', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', 'Bearer invalid.jwt.token');
      expect(res.status).toBe(401);
    });

    it('1.3: Token with stale authzVersion is rejected with 401 AUTHZ_VERSION_STALE', async () => {
      const staleToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        authzVersion: 0,
        isEmployee: false
      });

      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', staleToken);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    it('1.4: Revoked token JTI via tokenRevocationService returns 401', async () => {
      const jti = crypto.randomUUID();
      const token = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        authzVersion: 1,
        isEmployee: false,
        jti
      });

      await tokenRevocationService.revokeToken(jti, 3600);

      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', token);
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/revoked/i);
    });

    it('1.5: Inactive user account is rejected with 401', async () => {
      const inactiveUser = await User.create({
        name: 'Inactive User',
        email: `inactive.${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        active: false,
        authzVersion: 1
      });

      const token = tokenFor({
        id: inactiveUser.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        authzVersion: 1,
        isEmployee: false
      });

      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', token);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Multi-Tenant Isolation & Anti-Oracle Masking
  // =========================================================================
  describe('2. Multi-Tenant Isolation & Anti-Oracle Masking', () => {
    it('2.1: Org B owner querying /api/billing/invoices receives strictly Org B invoices, never Org A', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', ownerTokenB);

      expect(res.status).toBe(200);
      expect(res.body.invoices).toBeDefined();
      const invoiceNumbers = res.body.invoices.map(i => i.invoiceNumber);
      expect(invoiceNumbers).toContain(invoiceB1.invoiceNumber);
      expect(invoiceNumbers).not.toContain(invoiceA1.invoiceNumber);
      expect(invoiceNumbers).not.toContain(invoiceA2.invoiceNumber);
    });

    it('2.2: Org B owner querying /api/billing/subscription receives Org B subscription details', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', ownerTokenB);

      expect(res.status).toBe(200);
      expect(res.body.subscription.organizationId).toBe(orgB.id);
      expect(res.body.subscription.plan.code).toBe('starter');
    });

    it('2.3: Org B cashier querying M-Pesa status for Org A pending payment returns 404 anti-oracle', async () => {
      const res = await request(app)
        .get(`/api/mpesa/status/${pendingMpesaA1.checkoutRequestId}`)
        .set('Authorization', cashierTokenB1);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Pending payment not found.');
    });

    it('2.4: Org B cashier verifying Org A card payment returns 403 or 404 anti-oracle', async () => {
      const res = await request(app)
        .post('/api/card/verify')
        .set('Authorization', cashierTokenB1)
        .send({ reference: pendingCardA1.checkoutRequestId });

      expect([403, 404]).toContain(res.status);
    });

    it('2.5: Cross-tenant tampering: client passing foreign organizationId in body on renew is rejected', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', ownerTokenA)
        .send({
          channel: 'mpesa',
          phone: '0712345678',
          organizationId: orgB.id
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TENANT_MISMATCH');
    });
  });

  // =========================================================================
  // 3. Role & Governance Boundaries (Owner-Only Operations)
  // =========================================================================
  describe('3. Role & Governance Boundaries (Owner-Only Operations)', () => {
    it('3.1: Delegated Admin A1 (employee with orgRole=admin) is rejected on GET /api/billing/invoices with 403', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', adminTokenA1);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });

    it('3.2: Manager A1 is rejected on GET /api/billing/invoices with 403', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', managerTokenA1);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });

    it('3.3: Cashier A1 is rejected on GET /api/billing/invoices with 403', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', cashierTokenA1);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });

    it('3.4: Manager A1 is rejected on POST /api/billing/subscription/renew with 403', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', managerTokenA1)
        .send({ channel: 'mpesa', phone: '0712345678' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });

    it('3.5: Cashier A1 is rejected on POST /api/billing/subscription/renew with 403', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', cashierTokenA1)
        .send({ channel: 'mpesa', phone: '0712345678' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });

    it('3.6: Non-owner is rejected on POST /api/billing/subscription/cancel with 403', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/cancel')
        .set('Authorization', managerTokenA1);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });

    it('3.7: Non-owner is rejected on POST /api/billing/subscription/reactivate with 403', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/reactivate')
        .set('Authorization', managerTokenA1);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });

    it('3.8: Owner A CAN access GET /api/billing/invoices -> 200', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', ownerTokenA);

      expect(res.status).toBe(200);
      expect(res.body.invoices).toBeDefined();
      expect(Array.isArray(res.body.invoices)).toBe(true);
    });

    it('3.9: Active org member (Cashier A1) CAN view subscription -> 200', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', cashierTokenA1);

      expect(res.status).toBe(200);
      expect(res.body.subscription.organizationId).toBe(orgA.id);
    });

    it('3.10: Active org member (Manager A1) CAN view subscription -> 200', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', managerTokenA1);

      expect(res.status).toBe(200);
      expect(res.body.subscription.organizationId).toBe(orgA.id);
    });
  });

  // =========================================================================
  // 4. Branch Scope Isolation & POS Payment Permissions
  // =========================================================================
  describe('4. Branch Scope Isolation & POS Payment Permissions', () => {
    it('4.1: Cashier A1 CAN initiate M-Pesa STK push for shop A1', async () => {
      mpesaService.initiateStkPush.mockResolvedValueOnce('ws_CO_MOCK_REQ_123');

      const res = await request(app)
        .post('/api/mpesa/initiate')
        .set('Authorization', cashierTokenA1)
        .send({
          phone: '0712345678',
          amount: 250,
          orderId: `ORD_INIT_A1_${Date.now()}`
        });

      expect(res.status).toBe(200);
      expect(res.body.checkoutRequestId).toBe('ws_CO_MOCK_REQ_123');
    });

    it('4.2: Cashier A1 attempting to initiate M-Pesa for foreign shop is rejected with 403', async () => {
      const res = await request(app)
        .post('/api/mpesa/initiate?shopId=' + shopB1.id)
        .set('Authorization', cashierTokenA1)
        .send({
          phone: '0712345678',
          amount: 250,
          orderId: `ORD_INIT_FOR_${Date.now()}`
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    it('4.3: Cashier A1 CAN initiate Card checkout for shop A1', async () => {
      cardPaymentService.initiateCardPayment.mockResolvedValueOnce({
        paymentReference: 'FLW_MOCK_REF_123',
        redirectUrl: 'https://checkout.flutterwave.com/pay/mock'
      });

      const res = await request(app)
        .post('/api/card/initiate')
        .set('Authorization', cashierTokenA1)
        .send({
          amount: 300,
          orderId: `ORD_CARD_INIT_${Date.now()}`
        });

      expect(res.status).toBe(200);
      expect(res.body.paymentReference).toBe('FLW_MOCK_REF_123');
      expect(res.body.redirectUrl).toBe('https://checkout.flutterwave.com/pay/mock');
    });

    it('4.4: Cashier A1 attempting to initiate Card for foreign shop is rejected with 403', async () => {
      const res = await request(app)
        .post('/api/card/initiate?shopId=' + shopB1.id)
        .set('Authorization', cashierTokenA1)
        .send({
          amount: 300,
          orderId: `ORD_CARD_FOR_${Date.now()}`
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    it('4.5: Cashier A1 querying M-Pesa status for their own shop pending payment succeeds -> 200', async () => {
      const res = await request(app)
        .get(`/api/mpesa/status/${pendingMpesaA1.checkoutRequestId}`)
        .set('Authorization', cashierTokenA1);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');
    });

    it('4.6: Cashier A2 (Shop A2) querying M-Pesa status for Shop A1 pending payment returns 404 anti-oracle', async () => {
      const res = await request(app)
        .get(`/api/mpesa/status/${pendingMpesaA1.checkoutRequestId}`)
        .set('Authorization', cashierTokenA2);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Pending payment not found.');
    });
  });

  // =========================================================================
  // 5. Public Catalog & Webhook Cryptographic Integrity
  // =========================================================================
  describe('5. Public Catalog & Webhook Cryptographic Integrity', () => {
    it('5.1: GET /api/billing/plans is public and returns exactly 3 active public tiers', async () => {
      const res = await request(app)
        .get('/api/billing/plans');

      expect(res.status).toBe(200);
      expect(res.body.plans).toBeDefined();
      expect(res.body.plans.length).toBe(3);
      const codes = res.body.plans.map(p => p.code);
      expect(codes).toContain('starter');
      expect(codes).toContain('growth');
      expect(codes).toContain('pro');
      expect(codes).not.toContain('grandfathered');
    });

    it('5.2: POST /api/billing/mpesa/callback without token returns 401', async () => {
      const res = await request(app)
        .post('/api/billing/mpesa/callback')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/missing verification token/i);
    });

    it('5.3: POST /api/billing/flutterwave/webhook without valid signature header returns 401', async () => {
      const res = await request(app)
        .post('/api/billing/flutterwave/webhook')
        .set('verif-hash', 'wrong_signature')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Invalid or missing Flutterwave webhook signature/i);
    });

    it('5.4: POST /api/mpesa/callback without token query param returns 401', async () => {
      const res = await request(app)
        .post('/api/mpesa/callback')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/missing verification token/i);
    });

    it('5.5: POST /api/mpesa/callback with forged query token returns 401', async () => {
      const res = await request(app)
        .post('/api/mpesa/callback?token=forged_token_val')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: pendingMpesaA1.checkoutRequestId,
              ResultCode: 0,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: 500 },
                  { Name: 'MpesaReceiptNumber', Value: 'FORGED_RECEIPT' }
                ]
              }
            }
          }
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid verification token/i);
    });
  });

  // =========================================================================
  // 6. Authorization Lifecycle & Account Invalidation
  // =========================================================================
  describe('6. Authorization Lifecycle & Account Invalidation', () => {
    it('6.1: Owner account deactivation immediately rejects billing requests with 401', async () => {
      const deactivatedOwner = await User.create({
        name: `Deact Owner ${Date.now()}`,
        email: `deact.owner.${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        active: true,
        authzVersion: 1
      });

      await OrganizationMembership.create({
        organizationId: orgA.id,
        userId: deactivatedOwner.id,
        orgRole: 'owner',
        status: 'active'
      });

      const token = tokenFor({
        id: deactivatedOwner.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        authzVersion: 1,
        isEmployee: false
      });

      // Verify active
      let res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', token);
      expect(res.status).toBe(200);

      // Deactivate user
      await deactivatedOwner.update({ active: false });

      // Immediate rejection
      res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', token);
      expect(res.status).toBe(401);
    });

    it('6.2: Tenant membership suspension rejects requests with 403 MEMBERSHIP_SUSPENDED', async () => {
      const suspendedUser = await User.create({
        name: `Suspended User ${Date.now()}`,
        email: `suspended.${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        active: true,
        authzVersion: 1
      });

      const mem = await OrganizationMembership.create({
        organizationId: orgA.id,
        userId: suspendedUser.id,
        orgRole: 'member',
        status: 'active'
      });

      const token = tokenFor({
        id: suspendedUser.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        authzVersion: 1,
        isEmployee: false
      });

      // Suspend membership
      await mem.update({ status: 'suspended' });

      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_SUSPENDED');
    });

    it('6.3: Organization deletion rejects requests with 403 ORGANIZATION_DELETED', async () => {
      const delOrg = await Organization.create({
        name: `Del Org ${Date.now()}`,
        slug: `del-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      });

      await tokenRevocationService.setOrgStatus(delOrg.id, 'deleted');

      const delShop = await Shop.create({
        name: `Del Shop ${Date.now()}`,
        organizationId: delOrg.id,
        active: true
      });

      const delUser = await User.create({
        name: `Del User ${Date.now()}`,
        email: `del.user.${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: delShop.id,
        organizationId: delOrg.id,
        active: true,
        authzVersion: 1
      });

      await OrganizationMembership.create({
        organizationId: delOrg.id,
        userId: delUser.id,
        orgRole: 'owner',
        status: 'active'
      });

      const token = tokenFor({
        id: delUser.id,
        role: 'admin',
        shopId: delShop.id,
        organizationId: delOrg.id,
        authzVersion: 1,
        isEmployee: false
      });

      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_DELETED');
    });
  });
});
