'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const {
  sequelize,
  Organization,
  Subscription,
  Plan,
  User,
  Employee,
  Shop,
  OrganizationMembership,
  SystemSettings,
  Product,
  Category,
  Inventory
} = require('../src/models');
const emailService = require('../src/services/emailService');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Email Verification & Gating Security Suite', () => {
  let growthPlan;
  let testOrg;
  let testShop;
  let testCategory;
  let testProduct;

  const originalSmtpHost = process.env.SMTP_HOST;
  const originalSmtpPort = process.env.SMTP_PORT;

  beforeAll(async () => {
    await sequelize.authenticate();
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });
    if (!growthPlan) {
      growthPlan = await Plan.create({
        name: 'Growth Plan',
        code: 'growth',
        priceMonthly: 5000,
        priceYearly: 50000,
        currency: 'KES',
        maxShops: 3,
        maxUsers: 10,
        features: JSON.stringify({ org_insights: true })
      });
    }

    const ts = Date.now();
    testOrg = await Organization.create({
      name: `Verification Test Org ${ts}`,
      slug: `verify-org-${ts}`,
      status: 'active'
    });

    testShop = await Shop.create({
      name: `Verification Test Shop ${ts}`,
      organizationId: testOrg.id,
      active: true
    });

    await Subscription.create({
      organizationId: testOrg.id,
      planId: growthPlan.id,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    testCategory = await Category.create({
      name: `Verify Category ${ts}`,
      shopId: testShop.id
    });

    testProduct = await Product.create({
      name: `Test Product ${ts}`,
      sku: `SKU-${ts}`,
      price: 100,
      cost: 50,
      shopId: testShop.id,
      categoryId: testCategory.id,
      organizationId: testOrg.id,
      trackInventory: true
    });

    await Inventory.create({
      productId: testProduct.id,
      shopId: testShop.id,
      stockQuantity: 100,
      reorderPoint: 5
    });
  });

  afterAll(async () => {
    process.env.SMTP_HOST = originalSmtpHost;
    process.env.SMTP_PORT = originalSmtpPort;

    if (testProduct) {
      await Inventory.destroy({ where: { productId: testProduct.id } }).catch(() => {});
      await Product.destroy({ where: { id: testProduct.id } }).catch(() => {});
    }
    if (testCategory) await Category.destroy({ where: { id: testCategory.id } }).catch(() => {});
    if (testShop) {
      await SystemSettings.destroy({ where: { shopId: testShop.id } }).catch(() => {});
      await Employee.destroy({ where: { shopId: testShop.id } }).catch(() => {});
      await User.destroy({ where: { shopId: testShop.id } }).catch(() => {});
      await Shop.destroy({ where: { id: testShop.id } }).catch(() => {});
    }
    if (testOrg) {
      await OrganizationMembership.destroy({ where: { organizationId: testOrg.id } }).catch(() => {});
      await Subscription.destroy({ where: { organizationId: testOrg.id } }).catch(() => {});
      await Organization.destroy({ where: { id: testOrg.id } }).catch(() => {});
    }
  });

  describe('1. Migration up/down & Backfill Grandfathering', () => {
    it('migration up backfills emailVerifiedAt = NOW() for existing users with null emailVerifiedAt', async () => {
      const migration = require('../migrations/20260928010000-add-email-verification-to-users');

      // Create a user with emailVerifiedAt: null to simulate an existing user before migration backfill
      const preExistingUser = await User.create({
        name: 'Pre Existing User',
        email: `pre-existing-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: null
      });

      expect(preExistingUser.emailVerifiedAt).toBeNull();

      // Run migration.up to execute the backfill
      await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);

      // Verify the user now has emailVerifiedAt set
      await preExistingUser.reload();
      expect(preExistingUser.emailVerifiedAt).not.toBeNull();
      expect(new Date(preExistingUser.emailVerifiedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('migration file defines up and down functions properly', async () => {
      const migration = require('../migrations/20260928010000-add-email-verification-to-users');
      expect(typeof migration.up).toBe('function');
      expect(typeof migration.down).toBe('function');
    });
  });

  describe('2. Registration: Unverified user, email dispatch, and resilient 201 on mailer failure', () => {
    it('creates unverified user with token hash, triggers email, returns 201', async () => {
      const sendMailSpy = jest.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue({ messageId: 'test-mock-msg-1' });

      const email = `test-reg-${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New Registered Merchant',
          email,
          password: 'password123',
          shop: { name: 'New Shop' }
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.emailVerified).toBe(false);

      // Verify DB row: emailVerifiedAt is null, token hash is stored
      const createdUser = await User.findOne({ where: { email } });
      expect(createdUser).not.toBeNull();
      expect(createdUser.emailVerifiedAt).toBeNull();
      expect(createdUser.emailVerificationTokenHash).toBeDefined();
      expect(createdUser.emailVerificationTokenHash).toHaveLength(64);
      expect(createdUser.emailVerificationExpiresAt).toBeDefined();

      // Verify emailService was invoked with a verification link containing the raw token
      expect(sendMailSpy).toHaveBeenCalled();
      const callArg = sendMailSpy.mock.calls[0][0];
      expect(callArg.to).toBe(email);
      expect(callArg.verificationUrl).toContain('/verify-email?token=');

      sendMailSpy.mockRestore();
    });

    it('registration still returns 201 when the email service throws', async () => {
      const sendMailSpy = jest.spyOn(emailService, 'sendVerificationEmail').mockRejectedValue(new Error('SMTP connection timed out'));

      const email = `test-fail-mailer-${Date.now()}@example.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Resilient Merchant',
          email,
          password: 'password123',
          shop: { name: 'Resilient Shop' }
        });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.emailVerified).toBe(false);

      sendMailSpy.mockRestore();
    });
  });

  describe('3. Unverified Owner: POS allowed, sensitive routes gated with 403 EMAIL_NOT_VERIFIED, unblocked after verify without re-login', () => {
    let unverifiedOwner;
    let ownerToken;
    let rawToken;

    beforeAll(async () => {
      const email = `gated-owner-${Date.now()}@example.com`;
      rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      unverifiedOwner = await User.create({
        name: 'Gated Owner',
        email,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: null,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        emailVerificationSentAt: new Date()
      });

      await OrganizationMembership.create({
        organizationId: testOrg.id,
        userId: unverifiedOwner.id,
        orgRole: 'owner',
        status: 'active'
      });

      ownerToken = generateToken({
        id: unverifiedOwner.id,
        role: 'admin',
        orgRole: 'owner',
        shopId: testShop.id,
        organizationId: testOrg.id,
        isEmployee: false
      });
    });

    it('POS sale returns 201 for unverified owner (operational access open)', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', ownerToken)
        .set('Idempotency-Key', `sale-${Date.now()}`)
        .send({
          items: [{ productId: testProduct.id, quantity: 1, price: 100 }],
          paymentMethod: 'cash',
          paymentAmount: 100,
          total: 100
        });

      expect(res.status).toBe(201);
    });

    it('billing mutation (POST /subscription/cancel) returns 403 EMAIL_NOT_VERIFIED', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/cancel')
        .set('Authorization', ownerToken)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('POST /api/users returns 403 EMAIL_NOT_VERIFIED', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', ownerToken)
        .send({
          name: 'New Cashier',
          email: `cashier-${Date.now()}@example.com`,
          password: 'password123',
          role: 'cashier'
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('POST /api/employees returns 403 EMAIL_NOT_VERIFIED', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', ownerToken)
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: `emp-${Date.now()}@example.com`,
          password: 'password123',
          position: 'cashier',
          shopId: testShop.id
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('M-Pesa credential PUT /api/settings returns 403 EMAIL_NOT_VERIFIED', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set('Authorization', ownerToken)
        .send({
          consumerKey: 'test-consumer-key-123',
          tillNumber: '123456'
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('after verification, the SAME JWT succeeds for sensitive routes without re-login', async () => {
      // 1. Verify via token
      const verifyRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: rawToken });

      expect(verifyRes.status).toBe(200);

      // 2. Using the EXACT SAME ownerToken (no re-login), test POST /api/users
      const userRes = await request(app)
        .post('/api/users')
        .set('Authorization', ownerToken)
        .send({
          name: 'New Cashier After Verify',
          email: `cashier-verified-${Date.now()}@example.com`,
          password: 'password123',
          role: 'cashier'
        });

      expect(userRes.status).toBe(201);

      // 3. Using the EXACT SAME ownerToken, test POST /api/employees
      const empRes = await request(app)
        .post('/api/employees')
        .set('Authorization', ownerToken)
        .send({
          firstName: 'Jane',
          lastName: 'Verified',
          email: `emp-verified-${Date.now()}@example.com`,
          password: 'password123',
          salary: 15000,
          position: 'cashier',
          shopId: testShop.id
        });

      expect(empRes.status).toBe(201);
    });
  });

  describe('4. Token rules: unknown, expired, reused, tampered, hashing, resend invalidation & rate limits', () => {
    let testUser;
    let rawToken;
    let tokenHash;
    let userToken;

    beforeEach(async () => {
      rawToken = crypto.randomBytes(32).toString('hex');
      tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      testUser = await User.create({
        name: 'Token Rules User',
        email: `token-rules-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: null,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        emailVerificationSentAt: new Date(Date.now() - 120000) // 2 mins ago to pass cooldown
      });

      userToken = generateToken({
        id: testUser.id,
        role: 'admin',
        orgRole: 'owner',
        shopId: testShop.id,
        organizationId: testOrg.id,
        isEmployee: false
      });
    });

    it('rejects unknown token with 400', async () => {
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: 'unknown-token-that-does-not-exist' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid or expired');
    });

    it('rejects expired token with 400', async () => {
      await testUser.update({
        emailVerificationExpiresAt: new Date(Date.now() - 10000) // Expired 10s ago
      });

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: rawToken });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid or expired');
    });

    it('rejects tampered token with 400', async () => {
      const tampered = rawToken.slice(0, -2) + 'ff';
      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: tampered });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid or expired');
    });

    it('only the SHA-256 hash is stored in DB row (not the raw token)', async () => {
      const dbRow = await User.findByPk(testUser.id);
      expect(dbRow.emailVerificationTokenHash).toHaveLength(64);
      expect(dbRow.emailVerificationTokenHash).not.toBe(rawToken);
      expect(dbRow.emailVerificationTokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
    });

    it('single-use token: reused token returns 400', async () => {
      // First verification succeeds
      const firstRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: rawToken });
      expect(firstRes.status).toBe(200);

      // Second attempt with the SAME token returns 400
      const secondRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: rawToken });
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error).toContain('Invalid or expired');
    });

    it('resend invalidates the previous token', async () => {
      const sendMailSpy = jest.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue({});

      const resendRes = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', userToken);

      expect(resendRes.status).toBe(200);

      // Old rawToken must now fail
      const oldVerifyRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: rawToken });
      expect(oldVerifyRes.status).toBe(400);

      // Extract new token from mocked email call and verify it succeeds
      expect(sendMailSpy).toHaveBeenCalled();
      const lastCall = sendMailSpy.mock.calls[sendMailSpy.mock.calls.length - 1][0];
      const match = lastCall.verificationUrl.match(/token=([a-f0-9]+)/);
      expect(match).not.toBeNull();
      const newRawToken = match[1];
      expect(newRawToken).not.toBe(rawToken);

      const newVerifyRes = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: newRawToken });
      expect(newVerifyRes.status).toBe(200);

      sendMailSpy.mockRestore();
    });

    it('cooldown: resend within 60s returns 429', async () => {
      await testUser.update({
        emailVerificationSentAt: new Date() // Sent just now
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', userToken);

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });

    it('already-verified user calling resend returns 200 no-op', async () => {
      await testUser.update({
        emailVerifiedAt: new Date()
      });

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', userToken);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('already verified');
    });
  });

  describe('5. 7-Day Hard Gate: 8-day-old unverified owner blocked on normal routes, exempt routes work, SMTP unconfigured fails open', () => {
    let eightDayOldOwner;
    let eightDayToken;
    let eightDayRawToken;

    beforeAll(async () => {
      eightDayRawToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(eightDayRawToken).digest('hex');

      eightDayOldOwner = await User.create({
        name: 'Eight Day Owner',
        email: `eight-days-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: null,
        emailVerificationTokenHash: hash,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        emailVerificationSentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days old
      });

      await OrganizationMembership.create({
        organizationId: testOrg.id,
        userId: eightDayOldOwner.id,
        orgRole: 'owner',
        status: 'active'
      });

      eightDayToken = generateToken({
        id: eightDayOldOwner.id,
        role: 'admin',
        orgRole: 'owner',
        shopId: testShop.id,
        organizationId: testOrg.id,
        isEmployee: false
      });
    });

    it('unverified owner created 8 days ago receives 403 EMAIL_VERIFICATION_REQUIRED on normal routes', async () => {
      // Ensure SMTP is considered configured for this test
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', eightDayToken);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('8-day-old owner CAN still fetch auth profile (/api/auth/profile)', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', eightDayToken);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
    });

    it('8-day-old owner CAN still log out (/api/auth/logout)', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', eightDayToken);

      expect(res.status).toBe(200);
    });

    it('8-day-old owner CAN still request resend (/api/auth/resend-verification)', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      const sendSpy = jest.spyOn(emailService, 'sendVerificationEmail').mockResolvedValue({});

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', eightDayToken);

      expect(res.status).toBe(200);
      sendSpy.mockRestore();
    });

    it('8-day-old owner CAN still verify (/api/auth/verify-email)', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const verifyRawToken = crypto.randomBytes(32).toString('hex');
      const verifyHash = crypto.createHash('sha256').update(verifyRawToken).digest('hex');

      await User.create({
        name: 'Eight Day Owner To Verify',
        email: `eight-days-verify-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: null,
        emailVerificationTokenHash: verifyHash,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        emailVerificationSentAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      });

      const res = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: verifyRawToken });

      expect(res.status).toBe(200);
    });

    it('when SMTP is not configured, the 7-day gate FAILS OPEN (not blocked)', async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;

      // Re-create an unverified 8-day-old owner
      const unverified8DayUser = await User.create({
        name: 'SMTP Unset Owner',
        email: `smtp-unset-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: null,
        createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
      });

      await OrganizationMembership.create({
        organizationId: testOrg.id,
        userId: unverified8DayUser.id,
        orgRole: 'owner',
        status: 'active'
      });

      const token = generateToken({
        id: unverified8DayUser.id,
        role: 'admin',
        orgRole: 'owner',
        shopId: testShop.id,
        organizationId: testOrg.id,
        isEmployee: false
      });

      // Even though 8 days old and unverified, without SMTP configured, request passes through!
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', token);

      expect(res.status).toBe(200);

      // Restore SMTP
      process.env.SMTP_HOST = originalSmtpHost || 'smtp.example.com';
      process.env.SMTP_PORT = originalSmtpPort || '587';
    });
  });

  describe('6. Employee / Non-owner Admin / Grandfathered users are NEVER blocked', () => {
    it('employee is never blocked even if emailVerifiedAt is null and created > 7 days ago', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const emp = await Employee.create({
        id: crypto.randomUUID(),
        firstName: 'Exempt',
        lastName: 'Cashier',
        email: `exempt-emp-${Date.now()}@example.com`,
        password: 'Password123!',
        position: 'cashier',
        salary: 20000,
        status: 'active',
        shopId: testShop.id,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      });

      const employeeToken = generateToken({
        id: emp.id,
        role: 'cashier',
        shopId: testShop.id,
        organizationId: testOrg.id,
        isEmployee: true
      });

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', employeeToken);

      expect(res.status).toBe(200);
    });

    it('non-owner admin is never blocked', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const nonOwnerAdmin = await User.create({
        name: 'Branch Manager Admin',
        email: `non-owner-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: null,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days old
      });

      await OrganizationMembership.create({
        organizationId: testOrg.id,
        userId: nonOwnerAdmin.id,
        orgRole: 'admin', // Not owner
        status: 'active'
      });

      const token = generateToken({
        id: nonOwnerAdmin.id,
        role: 'admin',
        orgRole: 'admin',
        shopId: testShop.id,
        organizationId: testOrg.id,
        isEmployee: false
      });

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', token);

      expect(res.status).toBe(200);
    });

    it('grandfathered user is never blocked', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';

      const grandfatheredUser = await User.create({
        name: 'Grandfathered Owner',
        email: `gf-owner-${Date.now()}@example.com`,
        password: 'password123',
        role: 'admin',
        shopId: testShop.id,
        emailVerifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // verified 30 days ago
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      });

      await OrganizationMembership.create({
        organizationId: testOrg.id,
        userId: grandfatheredUser.id,
        orgRole: 'owner',
        status: 'active'
      });

      const token = generateToken({
        id: grandfatheredUser.id,
        role: 'admin',
        orgRole: 'owner',
        shopId: testShop.id,
        organizationId: testOrg.id,
        isEmployee: false
      });

      const res = await request(app)
        .get('/api/products')
        .set('Authorization', token);

      expect(res.status).toBe(200);
    });
  });
});
