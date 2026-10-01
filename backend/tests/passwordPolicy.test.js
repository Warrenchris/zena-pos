'use strict';

const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { User, Shop, Organization, OrganizationMembership, Subscription, Plan, sequelize } = require('../src/models');
const staffCreationService = require('../src/services/staffCreationService');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return jwt.sign(
    { ...payload, jti: `jti_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Phase 7D: Password Policy (D8 - 8 Character Minimum for New Passwords)', () => {
  let testOrg;
  let testShop;
  let ownerUser;

  beforeAll(async () => {
    const ts = Date.now();
    testOrg = await Organization.create({
      name: `PassPolicyOrg_${ts}`,
      slug: `pass-policy-org-${ts}`,
      status: 'active'
    });

    testShop = await Shop.create({
      organizationId: testOrg.id,
      name: `PassPolicyShop_${ts}`,
      active: true
    });
    
    // Create an existing legacy user with a 6-character password to prove D8 non-disruption
    ownerUser = await User.create({
      name: 'Legacy Owner',
      email: `legacy_owner_${ts}@example.com`,
      password: 'legacy', // 6 characters
      role: 'admin',
      shopId: testShop.id,
      active: true,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });
  });

  afterAll(async () => {
    if (ownerUser) await User.destroy({ where: { id: ownerUser.id } });
    if (testShop) await Shop.destroy({ where: { id: testShop.id } });
    if (testOrg) {
      await OrganizationMembership.destroy({ where: { organizationId: testOrg.id } });
      await Organization.destroy({ where: { id: testOrg.id } });
    }
  });

  describe('1. Registration Password Enforcement', () => {
    it('should reject registration when password is 7 characters long with a clear 400 error', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Short Pass User',
          email: `short_pass_${ts}@example.com`,
          password: 'Pass12!', // 7 chars
          shop: { name: `Short Pass Shop ${ts}` }
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Password must be at least 8 characters long');
    });

    it('should accept registration when password is exactly 8 characters long', async () => {
      const ts = Date.now();
      const email = `pass8_${ts}@example.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Valid Pass User',
          email,
          password: 'Pass123!', // 8 chars
          shop: { name: `Pass 8 Shop ${ts}` }
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();

      // Cleanup
      const createdUser = await User.findOne({ where: { email } });
      if (createdUser) {
        const userShop = await Shop.findByPk(createdUser.shopId);
        await User.destroy({ where: { id: createdUser.id } });
        if (userShop) {
          await Subscription.destroy({ where: { organizationId: userShop.organizationId } });
          await OrganizationMembership.destroy({ where: { organizationId: userShop.organizationId } });
          await Shop.destroy({ where: { id: userShop.id } });
          await Organization.destroy({ where: { id: userShop.organizationId } });
        }
      }
    });
  });

  describe('2. Reset Password Enforcement', () => {
    it('should reject password reset when new password is 7 characters long', async () => {
      const resetToken = generateToken({
        id: ownerUser.id,
        purpose: 'password_reset'
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'Pass12!' // 7 chars
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Password must be at least 8 characters long');
    });

    it('should accept password reset when new password is at least 8 characters long', async () => {
      const resetToken = generateToken({
        id: ownerUser.id,
        purpose: 'password_reset'
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'NewResetPass123!' // > 8 chars
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/password updated successfully/i);
    });
  });

  describe('3. D8 Invariant: Existing Passwords Allowed at Login', () => {
    it('should allow legacy users with existing 6-character passwords to log in without disruption', async () => {
      const ts = Date.now();
      const legacyEmail = `legacy_login_${ts}@example.com`;
      const legacyUser = await User.create({
        name: 'Legacy Cashier',
        shopId: testShop.id,
        email: legacyEmail,
        password: 'pass12', // exactly 6 chars
        role: 'cashier',
        active: true
      });

      try {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            email: legacyEmail,
            password: 'pass12'
          });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
      } finally {
        await User.destroy({ where: { id: legacyUser.id } });
      }
    });
  });

  describe('4. Change Password Enforcement', () => {
    it('should reject change password when new password is less than 8 characters', async () => {
      // Log in as owner to obtain fresh session token with updated password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: ownerUser.email,
          password: 'NewResetPass123!'
        });
      expect(loginRes.status).toBe(200);
      const activeToken = loginRes.body.token;

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${activeToken}`)
        .send({
          currentPassword: 'NewResetPass123!',
          newPassword: 'Pass12!', // 7 chars
          confirmPassword: 'Pass12!'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 8 characters');
    });
  });

  describe('5. Staff Creation Password Policy', () => {
    it('should reject staff creation when password is less than 8 characters', async () => {
      await expect(
        staffCreationService.createStaffMember({
          body: {
            email: `staff_short_${Date.now()}@example.com`,
            name: 'Short Staff',
            password: 'Pass12!', // 7 chars
            role: 'cashier'
          },
          reqOrgId: testOrg.id,
          targetShopId: testShop.id,
          actor: { id: ownerUser.id, role: 'admin', organizationId: testOrg.id }
        })
      ).rejects.toThrow('Password must be at least 8 characters long');
    });
  });

  describe('6. SystemSettings Password Floor Enforcement', () => {
    it('should reject setting passwordMinLength below 8 via settings update', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: ownerUser.email,
          password: 'NewResetPass123!'
        });
      expect(loginRes.status).toBe(200);
      const activeToken = loginRes.body.token;

      const res = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${activeToken}`)
        .send({
          passwordMinLength: 6 // Should be rejected as below the 8-character floor
        });

      expect(res.status).toBe(400);
    });
  });
});
