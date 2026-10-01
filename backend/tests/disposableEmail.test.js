'use strict';

const request = require('supertest');
const app = require('../src/app');
const { isDisposableEmail } = require('../src/utils/disposableEmail');
const { User, Shop, Organization, OrganizationMembership, Subscription } = require('../src/models');

describe('Phase 7D: Disposable Email Blocking (SEC-02 Remainder)', () => {
  describe('1. Unit Tests: isDisposableEmail Utility', () => {
    it('should detect known disposable email domains', () => {
      expect(isDisposableEmail('test@mailinator.com')).toBe(true);
      expect(isDisposableEmail('user@tempmail.com')).toBe(true);
      expect(isDisposableEmail('someone@10minutemail.com')).toBe(true);
      expect(isDisposableEmail('spammer@guerrillamail.com')).toBe(true);
      expect(isDisposableEmail('bot@sharklasers.com')).toBe(true);
      expect(isDisposableEmail('fake@yopmail.com')).toBe(true);
      expect(isDisposableEmail('anon@throwawaymail.com')).toBe(true);
      expect(isDisposableEmail('throw@dispostable.com')).toBe(true);
    });

    it('should be case-insensitive and trim whitespace', () => {
      expect(isDisposableEmail('Test@Mailinator.COM ')).toBe(true);
      expect(isDisposableEmail('  User@TempMail.Com')).toBe(true);
      expect(isDisposableEmail('USER@SHARKLASERS.COM')).toBe(true);
    });

    it('should accept legitimate public and business email domains', () => {
      expect(isDisposableEmail('john.doe@gmail.com')).toBe(false);
      expect(isDisposableEmail('jane@yahoo.com')).toBe(false);
      expect(isDisposableEmail('contact@outlook.com')).toBe(false);
      expect(isDisposableEmail('admin@safaricom.co.ke')).toBe(false);
      expect(isDisposableEmail('shopowner@nairobibusiness.com')).toBe(false);
      expect(isDisposableEmail('merchant@zanapos.co.ke')).toBe(false);
    });

    it('should handle malformed or non-string inputs safely without throwing', () => {
      expect(isDisposableEmail(null)).toBe(false);
      expect(isDisposableEmail(undefined)).toBe(false);
      expect(isDisposableEmail('')).toBe(false);
      expect(isDisposableEmail('not-an-email')).toBe(false);
      expect(isDisposableEmail(12345)).toBe(false);
      expect(isDisposableEmail('@onlydomain.com')).toBe(false);
    });
  });

  describe('2. Integration: POST /api/auth/register Rejection', () => {
    it('should reject registration with mailinator.com with 400 Bad Request', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Spam User',
          email: `spammer_${ts}@mailinator.com`,
          password: 'Password123!',
          shop: { name: `Spam Shop ${ts}` }
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Disposable or temporary email addresses are not permitted');

      // Verify no user record was created in the database
      const user = await User.findOne({ where: { email: `spammer_${ts}@mailinator.com` } });
      expect(user).toBeNull();
    });

    it('should reject registration with tempmail.com with 400 Bad Request', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Temp User',
          email: `temp_${ts}@tempmail.com`,
          password: 'Password123!',
          shop: { name: `Temp Shop ${ts}` }
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Disposable or temporary email addresses are not permitted');
    });

    it('should allow registration with a legitimate email domain', async () => {
      const ts = Date.now();
      const legitimateEmail = `valid_merchant_${ts}@legitdomain.co.ke`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Legit Merchant',
          email: legitimateEmail,
          password: 'Password123!',
          shop: { name: `Legit Shop ${ts}` }
        });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();

      // Cleanup
      const createdUser = await User.findOne({ where: { email: legitimateEmail } });
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
});
