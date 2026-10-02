'use strict';

/**
 * emailFixes.test.js — Phase 4 unit tests (no DB, no Redis).
 *
 * Covers:
 *  1. escapeHtml — <script>, quotes, &, null/undefined
 *  2. getSender  — no "undefined" when env vars unset
 *  3. Billing email XSS — sendPaymentReceiptEmail with hostile name
 *  4. forgotPassword (B1) — active employee, inactive employee, unknown email
 */

// ── Module-level mocks (Jest hoists these before any require) ────────────────

// Prevent nodemailer from opening real SMTP connections when emailService loads.
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn(),
    sendMail: jest.fn().mockResolvedValue({ messageId: 'nodemailer-mock' }),
  })),
}));

// Silence all startup and runtime logs from emailService / authController.
jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// authController dependencies
jest.mock('../src/models/User',     () => ({ findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() }));
jest.mock('../src/models/Employee', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));
jest.mock('../src/models/Shop',     () => ({ findOne: jest.fn(), create:   jest.fn() }));
jest.mock('../src/models', () => ({
  sequelize: {
    transaction: jest.fn((fn) => fn({ commit: jest.fn(), rollback: jest.fn() })),
  },
  Organization:          { create: jest.fn() },
  OrganizationMembership:{ create: jest.fn(), findOne: jest.fn().mockResolvedValue(null) },
  ShopAccess:            { findOne: jest.fn() },
  Subscription:          { create: jest.fn() },
  Plan:                  { findOne: jest.fn() },
}));
jest.mock('../src/utils/frontendUrl', () => ({
  getFrontendUrl:         jest.fn(() => 'http://localhost:5173'),
  getFrontendUrlProblems: jest.fn(() => []),
}));
jest.mock('../src/services/tokenRevocationService', () => ({
  isTokenRevoked:      jest.fn().mockResolvedValue(false),
  revokeToken:         jest.fn().mockResolvedValue(undefined),
  revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
  getUserTokenCutoff:  jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/utils/serializeAuthResponse', () => ({
  buildAuthPayload: jest.fn(() => ({})),
  resolveAuthRole:  jest.fn((pos) => pos || 'cashier'),
}));

// ── Require real modules after mocks are in place ────────────────────────────

const emailService = require('../src/services/emailService');
const { escapeHtml, getSender } = emailService;

const { forgotPassword } = require('../src/controllers/authController');
const User     = require('../src/models/User');
const Employee = require('../src/models/Employee');
const jwt      = require('jsonwebtoken');

// ── 1. escapeHtml ─────────────────────────────────────────────────────────────

describe('escapeHtml (B5)', () => {
  test('escapes <script> open and close tags', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('escapes double quotes, single quotes, and ampersands together', () => {
    expect(escapeHtml('"hello" & \'world\''))
      .toBe('&quot;hello&quot; &amp; &#39;world&#39;');
  });

  test('escapes & alone', () => {
    expect(escapeHtml('cats & dogs')).toBe('cats &amp; dogs');
  });

  test('null → empty string', () => {
    expect(escapeHtml(null)).toBe('');
  });

  test('undefined → empty string', () => {
    expect(escapeHtml(undefined)).toBe('');
  });
});

// ── 2. getSender fallbacks (B3, A1) ──────────────────────────────────────────

describe('getSender (B3)', () => {
  const origFrom    = process.env.SMTP_FROM;
  const origCompany = process.env.COMPANY_NAME;

  afterEach(() => {
    if (origFrom    === undefined) delete process.env.SMTP_FROM;
    else                           process.env.SMTP_FROM = origFrom;
    if (origCompany === undefined) delete process.env.COMPANY_NAME;
    else                           process.env.COMPANY_NAME = origCompany;
  });

  test('no "undefined" when SMTP_FROM and COMPANY_NAME are unset', () => {
    delete process.env.SMTP_FROM;
    delete process.env.COMPANY_NAME;
    const sender = getSender();
    expect(sender).not.toContain('undefined');
    expect(sender).toContain('noreply@zanapos.com');
    expect(sender).toContain('Zana POS');
  });

  test('uses env values when both are set', () => {
    process.env.SMTP_FROM    = 'info@myshop.com';
    process.env.COMPANY_NAME = 'My Shop';
    expect(getSender()).toBe('"My Shop" <info@myshop.com>');
  });
});

// ── 3. Billing email XSS escaping (B5) ───────────────────────────────────────

describe('billing email HTML XSS escaping (B5)', () => {
  const xssName = '<img src=x onerror=alert(1)>';
  let sendMailMock;

  beforeEach(() => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'xss-test-id' });
    emailService.setTransporter({ sendMail: sendMailMock });
  });

  afterEach(() => {
    emailService.setTransporter(null);
  });

  test('sendPaymentReceiptEmail: XSS name escaped; raw <img> tag absent from HTML', async () => {
    await emailService.sendPaymentReceiptEmail({
      to:           'user@example.com',
      name:         xssName,
      invoiceNumber:'INV-XSS-001',
      amount:        500,
      currency:     'KES',
      paymentMethod:'card',
      newPeriodEnd:  null,
      receiptUrl:    null,
      isEmailVerified: true,
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const { html } = sendMailMock.mock.calls[0][0];
    // Raw attack string must not appear
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    // Escaped form must appear
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

// ── 4. forgotPassword — employee path (B1) ────────────────────────────────────

describe('forgotPassword — employee path (B1)', () => {
  let sendPasswordResetSpy;

  beforeEach(() => {
    User.findOne.mockReset();
    Employee.findOne.mockReset();
    sendPasswordResetSpy = jest
      .spyOn(emailService, 'sendPasswordReset')
      .mockResolvedValue({});
  });

  afterEach(() => {
    sendPasswordResetSpy.mockRestore();
  });

  function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
  }

  // Give fire-and-forget .catch() time to settle
  const flushAsync = () => new Promise((r) => setImmediate(r));

  test('active employee: generic 200 returned; reset email sent; token carries isEmployee:true', async () => {
    User.findOne.mockResolvedValue(null);
    Employee.findOne.mockResolvedValue({ id: 77, email: 'emp@corp.com', status: 'active' });

    const res = makeRes();
    await forgotPassword({ body: { email: 'emp@corp.com' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      message: 'If the email exists, a reset link has been sent.',
    });

    await flushAsync();
    expect(sendPasswordResetSpy).toHaveBeenCalledTimes(1);

    const { resetUrl } = sendPasswordResetSpy.mock.calls[0][0];
    const rawToken = resetUrl.split('token=')[1];
    const pubKey   = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
    const decoded  = jwt.verify(rawToken, pubKey, { algorithms: ['RS256'] });

    expect(decoded.isEmployee).toBe(true);
    expect(decoded.id).toBe(77);
    expect(decoded.purpose).toBe('password_reset');
  });

  test('inactive employee: identical generic 200; no email sent', async () => {
    User.findOne.mockResolvedValue(null);
    Employee.findOne.mockResolvedValue({ id: 88, email: 'old@corp.com', status: 'inactive' });

    const res = makeRes();
    await forgotPassword({ body: { email: 'old@corp.com' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      message: 'If the email exists, a reset link has been sent.',
    });
    await flushAsync();
    expect(sendPasswordResetSpy).not.toHaveBeenCalled();
  });

  test('unknown email: identical generic 200; no email sent', async () => {
    User.findOne.mockResolvedValue(null);
    Employee.findOne.mockResolvedValue(null);

    const res = makeRes();
    await forgotPassword({ body: { email: 'ghost@corp.com' } }, res);

    expect(res.json).toHaveBeenCalledWith({
      message: 'If the email exists, a reset link has been sent.',
    });
    await flushAsync();
    expect(sendPasswordResetSpy).not.toHaveBeenCalled();
  });
});
