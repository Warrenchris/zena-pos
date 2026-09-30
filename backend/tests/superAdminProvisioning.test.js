'use strict';

const { User, Shop, Organization, sequelize } = require('../src/models');
const { createSuperAdmin, validatePassword } = require('../scripts/createSuperAdmin');

describe('Phase 7B Step 1: Super Admin Schema, Provisioning & Validation', () => {
  let testShop;
  let testOrg;
  let createdSuperAdminId;

  beforeAll(async () => {
    testOrg = await Organization.create({
      name: 'Provisioning Test Org',
      slug: `prov-org-${Date.now()}`,
      status: 'active'
    });

    testShop = await Shop.create({
      name: 'Provisioning Test Shop',
      organizationId: testOrg.id,
      active: true
    });
  });

  afterAll(async () => {
    if (createdSuperAdminId) {
      await User.destroy({ where: { id: createdSuperAdminId } });
    }
    if (testShop) {
      await Shop.destroy({ where: { id: testShop.id } });
    }
    if (testOrg) {
      await Organization.destroy({ where: { id: testOrg.id } });
    }
  });

  describe('Password Validation for Super Admin', () => {
    it('should reject passwords shorter than 8 characters', () => {
      expect(validatePassword('Short1!')).toBe('Password must be at least 8 characters long');
    });

    it('should reject passwords with only letters or only numbers', () => {
      expect(validatePassword('onlylettershere')).toBe('Password must contain both letters and numbers');
      expect(validatePassword('1234567890')).toBe('Password must contain both letters and numbers');
    });

    it('should accept valid complex passwords', () => {
      expect(validatePassword('ValidPass123!')).toBeNull();
    });
  });

  describe('User Model Validation with super_admin and shopId', () => {
    it('should reject a tenant user (admin/manager/cashier) with shopId: null', async () => {
      await expect(
        User.create({
          name: 'Invalid Tenant User',
          email: `invalid-tenant-${Date.now()}@test.com`,
          password: 'password123',
          role: 'cashier',
          shopId: null
        })
      ).rejects.toThrow('shopId is required for tenant users');
    });

    it('should allow super_admin role with shopId: null', async () => {
      const superAdmin = await User.create({
        name: 'Direct Model SuperAdmin',
        email: `direct-sa-${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'super_admin',
        shopId: null
      });

      expect(superAdmin.id).toBeDefined();
      expect(superAdmin.role).toBe('super_admin');
      expect(superAdmin.shopId).toBeNull();

      await superAdmin.destroy();
    });
  });

  describe('CLI createSuperAdmin Script Provisioning', () => {
    const saEmail = `sa-cli-${Date.now()}@zanapos.com`;

    it('should provision a new super-admin cleanly with CLI parameters', async () => {
      const sa = await createSuperAdmin({
        email: saEmail,
        name: 'CLI Operator',
        password: 'OperatorPass2026!'
      });

      createdSuperAdminId = sa.id;
      expect(sa.id).toBeDefined();
      expect(sa.email).toBe(saEmail);
      expect(sa.role).toBe('super_admin');
      expect(sa.shopId).toBeNull();
      expect(sa.emailVerifiedAt).not.toBeNull();

      // Verify password hashed and valid
      const isValid = await sa.validatePassword('OperatorPass2026!');
      expect(isValid).toBe(true);
    });

    it('should return existing super-admin idempotently on re-run with same email', async () => {
      const sa = await createSuperAdmin({
        email: saEmail,
        name: 'CLI Operator Duplicate',
        password: 'OperatorPass2026!'
      });

      expect(sa.id).toBe(createdSuperAdminId);
    });

    it('should refuse to convert an existing tenant user to super-admin', async () => {
      const tenantUser = await User.create({
        name: 'Existing Tenant User',
        email: `existing-tenant-${Date.now()}@test.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: testShop.id
      });

      try {
        await expect(
          createSuperAdmin({
            email: tenantUser.email,
            name: 'Attempted Hijack',
            password: 'OperatorPass2026!'
          })
        ).rejects.toThrow(/Cannot convert tenant user to super-admin/);
      } finally {
        await tenantUser.destroy();
      }
    });
  });
});
