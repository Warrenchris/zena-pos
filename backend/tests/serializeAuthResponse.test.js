'use strict';

const { buildAuthPayload, resolveAuthRole } = require('../src/utils/serializeAuthResponse');

describe('buildAuthPayload', () => {
  test('flat user.shopId prefers the resolved active shop over the stale DB column', () => {
    const payload = buildAuthPayload({
      user: { id: 1, name: 'Owner', email: 'o@test.com', role: 'admin', shopId: 10 },
      shop: { id: 22, name: 'Switched Branch', organizationId: 5 },
      orgRole: 'owner',
      organizationId: 5
    });

    expect(payload.user.shopId).toBe(22);
    expect(payload.user.shop.id).toBe(22);
    expect(payload.user.shopId).toBe(payload.user.shop.id);
    expect(payload.shop.id).toBe(22);
  });

  test('missing User.role fails closed to employee, not admin', () => {
    const payload = buildAuthPayload({
      user: { id: 1, name: 'No Role', email: 'n@test.com', shopId: 1 },
      shop: { id: 1, name: 'HQ', organizationId: 1 }
    });

    expect(payload.user.role).toBe('employee');
    expect(payload.user.role).not.toBe('admin');
  });

  test('employee payload uses position as role, not the literal string employee', () => {
    const payload = buildAuthPayload({
      employee: {
        id: 'emp-1',
        firstName: 'Ada',
        lastName: 'Cash',
        email: 'ada@test.com',
        position: 'cashier',
        shopId: 1
      },
      shop: { id: 1, name: 'HQ', organizationId: 1 },
      orgRole: 'member'
    });

    expect(payload.user.role).toBe('cashier');
  });

  test('User.role admin is preserved on User-table payloads', () => {
    const payload = buildAuthPayload({
      user: { id: 1, name: 'Owner', email: 'o@test.com', role: 'admin', shopId: 1 },
      shop: { id: 1, name: 'HQ', organizationId: 1 }
    });
    expect(payload.user.role).toBe('admin');
  });

  test('unknown employee position fails closed to employee', () => {
    const payload = buildAuthPayload({
      employee: {
        id: 'emp-2',
        firstName: 'Pat',
        lastName: 'Intern',
        email: 'pat@test.com',
        position: 'intern',
        shopId: 1
      },
      shop: { id: 1, name: 'HQ', organizationId: 1 }
    });

    expect(payload.user.role).toBe('employee');
  });

  test('employee position admin/ADMIN/Admin never maps to JWT admin', () => {
    for (const position of ['admin', 'ADMIN', 'Admin']) {
      expect(resolveAuthRole(position)).toBe('employee');
      const payload = buildAuthPayload({
        employee: {
          id: 'emp-admin',
          firstName: 'A',
          lastName: 'Dmin',
          email: 'a@test.com',
          position,
          shopId: 1
        },
        shop: { id: 1, name: 'HQ', organizationId: 1 }
      });
      expect(payload.user.role).toBe('employee');
    }
  });

  test('trimmed cashier position maps to cashier', () => {
    expect(resolveAuthRole(' cashier ')).toBe('cashier');
  });

  test('employee position admin with orgRole admin resolves to org_admin, never literal admin', () => {
    for (const position of ['admin', 'ADMIN', 'Admin']) {
      expect(resolveAuthRole(position, 'admin')).toBe('org_admin');
      expect(resolveAuthRole(position, 'admin')).not.toBe('admin');
      const payload = buildAuthPayload({
        employee: {
          id: 'emp-admin',
          firstName: 'A',
          lastName: 'Dmin',
          email: 'a@test.com',
          position,
          shopId: 1
        },
        shop: { id: 1, name: 'HQ', organizationId: 1 },
        orgRole: 'admin'
      });
      expect(payload.user.role).toBe('org_admin');
      expect(payload.user.role).not.toBe('admin');
    }
  });

  test('emailVerified is false for user with null emailVerifiedAt', () => {
    const payload = buildAuthPayload({
      user: { id: 1, name: 'Owner', email: 'owner@test.com', role: 'admin', emailVerifiedAt: null },
      shop: { id: 1, name: 'HQ', organizationId: 1 }
    });
    expect(payload.user.emailVerified).toBe(false);
  });

  test('emailVerified is true for user with emailVerifiedAt date', () => {
    const payload = buildAuthPayload({
      user: { id: 1, name: 'Owner', email: 'owner@test.com', role: 'admin', emailVerifiedAt: new Date() },
      shop: { id: 1, name: 'HQ', organizationId: 1 }
    });
    expect(payload.user.emailVerified).toBe(true);
  });

  test('emailVerified is always true for employees', () => {
    const payload = buildAuthPayload({
      employee: {
        id: 'emp-1',
        firstName: 'Emp',
        lastName: 'Loyee',
        email: 'emp@test.com',
        position: 'cashier',
        shopId: 1
      },
      shop: { id: 1, name: 'HQ', organizationId: 1 }
    });
    expect(payload.user.emailVerified).toBe(true);
  });
});
