'use strict';

const jwt = require('jsonwebtoken');
const { User, sequelize } = require('../src/models');
const { requirePlatformSuperAdmin, clearVerifiedCache } = require('../src/middleware/requirePlatformSuperAdmin');

function generateToken(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Phase 7B Step 2: requirePlatformSuperAdmin Middleware Suite', () => {
  let verifiedSuperAdmin;
  let unverifiedSuperAdmin;
  let tenantAdmin;
  let req;
  let res;
  let next;

  beforeAll(async () => {
    verifiedSuperAdmin = await User.create({
      name: 'Verified SuperAdmin',
      email: `sa-verified-${Date.now()}@test.com`,
      password: 'password123',
      role: 'super_admin',
      shopId: null,
      active: true,
      emailVerifiedAt: new Date()
    });

    unverifiedSuperAdmin = await User.create({
      name: 'Unverified SuperAdmin',
      email: `sa-unverified-${Date.now()}@test.com`,
      password: 'password123',
      role: 'super_admin',
      shopId: null,
      active: true,
      emailVerifiedAt: null
    });

    tenantAdmin = await User.create({
      name: 'Tenant Admin',
      email: `tenant-admin-${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: 1, // Assume shop 1 exists in test setup
      active: true,
      emailVerifiedAt: new Date()
    });
  });

  afterAll(async () => {
    if (verifiedSuperAdmin) await verifiedSuperAdmin.destroy();
    if (unverifiedSuperAdmin) await unverifiedSuperAdmin.destroy();
    if (tenantAdmin) await tenantAdmin.destroy();
  });

  beforeEach(() => {
    clearVerifiedCache();
    req = {
      header: jest.fn(),
      shopId: 999,
      organizationId: 888
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  it('should return 401 when Authorization header is missing', async () => {
    req.header.mockReturnValue(undefined);

    await requirePlatformSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Authorization token required.' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid or corrupt', async () => {
    req.header.mockReturnValue('Bearer invalid.corrupt.token');

    await requirePlatformSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject password reset tokens with 401', async () => {
    const resetToken = generateToken({
      id: verifiedSuperAdmin.id,
      role: 'super_admin',
      purpose: 'password_reset'
    });
    req.header.mockReturnValue(`Bearer ${resetToken}`);

    await requirePlatformSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Invalid token purpose') }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 Forbidden when caller is a tenant admin or cashier', async () => {
    const token = generateToken({
      id: tenantAdmin.id,
      role: 'admin',
      shopId: 1
    });
    req.header.mockReturnValue(`Bearer ${token}`);

    await requirePlatformSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Access denied: platform super-admin privileges required.'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 EMAIL_VERIFICATION_REQUIRED if super_admin email is not verified (zero grace)', async () => {
    const token = generateToken({
      id: unverifiedSuperAdmin.id,
      role: 'super_admin',
      shopId: null
    });
    req.header.mockReturnValue(`Bearer ${token}`);

    await requirePlatformSuperAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      error: expect.stringContaining('must be verified')
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should allow verified super-admin and explicitly strip shopId & organizationId', async () => {
    const token = generateToken({
      id: verifiedSuperAdmin.id,
      role: 'super_admin',
      shopId: null
    });
    req.header.mockReturnValue(`Bearer ${token}`);

    await requirePlatformSuperAdmin(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.id).toBe(verifiedSuperAdmin.id);
    expect(req.user.role).toBe('super_admin');
    expect(req.shopId).toBeNull();
    expect(req.organizationId).toBeNull();
  });
});
