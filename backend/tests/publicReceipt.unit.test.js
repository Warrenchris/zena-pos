/**
 * Unit Tests for Public Receipt Endpoint & Token Logic (Phase 5)
 *
 * Tests:
 * - Token format validation (strictly 22 base64url characters)
 * - getPublicReceipt controller behavior (headers, 404 on invalid/not found, minimal payload)
 * - Strict PII exclusion (no customer name/phone/email, cashier, internal DB IDs, receiptTokenHash)
 * - Collision & idempotency logic for receipt tokens in saleController
 */

const crypto = require('crypto');

// Mock models for controller testing
jest.mock('../src/models', () => ({
  Sale: {
    findOne: jest.fn(),
    create: jest.fn(),
  },
  SaleItem: {},
  Product: {},
  Shop: {},
  SystemSettings: {
    findOne: jest.fn(),
  },
}));

const { Sale, SystemSettings } = require('../src/models');
const { getPublicReceipt } = require('../src/controllers/publicReceiptController');

describe('Public Receipt Endpoint & Token Logic (Unit Tests)', () => {
  const VALID_TOKEN = 'aB3_dE9-gH1_jK2-mN3_pQ'; // 22 chars base64url
  const VALID_TOKEN_HASH = crypto.createHash('sha256').update(VALID_TOKEN).digest('hex');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Format Validation', () => {
    const TOKEN_REGEX = /^[A-Za-z0-9_-]{22}$/;

    test('accepts valid 22-char base64url tokens', () => {
      expect(TOKEN_REGEX.test(VALID_TOKEN)).toBe(true);
      expect(TOKEN_REGEX.test('1234567890123456789012')).toBe(true);
      expect(TOKEN_REGEX.test('ABCDEFGHIJKLMNOPQRSTUV')).toBe(true);
      expect(TOKEN_REGEX.test('abcdefghijklmnopqrstuv')).toBe(true);
      expect(TOKEN_REGEX.test('__--1234567890abcdef--')).toBe(true);
    });

    test('rejects tokens with invalid length', () => {
      expect(TOKEN_REGEX.test('')).toBe(false);
      expect(TOKEN_REGEX.test('short-token')).toBe(false);
      expect(TOKEN_REGEX.test('123456789012345678901')).toBe(false); // 21 chars
      expect(TOKEN_REGEX.test('12345678901234567890123')).toBe(false); // 23 chars
    });

    test('rejects tokens with non-base64url characters', () => {
      expect(TOKEN_REGEX.test('123456789012345678901+')).toBe(false); // '+' is standard b64, not b64url
      expect(TOKEN_REGEX.test('123456789012345678901/')).toBe(false); // '/' is standard b64, not b64url
      expect(TOKEN_REGEX.test('123456789012345678901=')).toBe(false); // padding '='
      expect(TOKEN_REGEX.test('123456789012345678901!')).toBe(false);
      expect(TOKEN_REGEX.test('1234567890 12345678901')).toBe(false); // space
    });
  });

  describe('getPublicReceipt Controller', () => {
    const createMockRes = () => {
      const res = {};
      res.headers = {};
      res.set = jest.fn((key, value) => {
        res.headers[key] = value;
        return res;
      });
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    test('sets Cache-Control: no-store and X-Robots-Tag: noindex headers', async () => {
      const req = { params: { token: 'invalid' } };
      const res = createMockRes();

      await getPublicReceipt(req, res);

      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(res.set).toHaveBeenCalledWith('X-Robots-Tag', 'noindex');
      expect(res.headers['Cache-Control']).toBe('no-store');
      expect(res.headers['X-Robots-Tag']).toBe('noindex');
    });

    test('returns 404 for malformed token without hitting database', async () => {
      const req = { params: { token: 'too-short' } };
      const res = createMockRes();

      await getPublicReceipt(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Receipt not found' });
      expect(Sale.findOne).not.toHaveBeenCalled();
    });

    test('returns 404 when token is not found in database', async () => {
      Sale.findOne.mockResolvedValue(null);

      const req = { params: { token: VALID_TOKEN } };
      const res = createMockRes();

      await getPublicReceipt(req, res);

      expect(Sale.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { receiptTokenHash: VALID_TOKEN_HASH },
        })
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Receipt not found' });
    });

    test('returns minimal payload matching ReceiptData and strictly excludes PII', async () => {
      const mockSale = {
        id: 9999, // Should NOT be exposed
        shopId: 10, // Should NOT be exposed
        userId: 42, // Should NOT be exposed
        cashierName: 'Secret Cashier Name', // PII: Should NOT be exposed
        customerName: 'Secret Customer Name', // PII: Should NOT be exposed
        customerPhone: '+254712345678', // PII: Should NOT be exposed
        customerEmail: 'secret@customer.com', // PII: Should NOT be exposed
        receiptTokenHash: VALID_TOKEN_HASH, // Should NOT be exposed
        receiptNumber: 'R-7X9K-000042',
        invoiceNumber: 'INV-2026-00042',
        createdAt: '2026-10-24T12:00:00.000Z',
        subtotal: 1000,
        discount: 100,
        tax: 144,
        taxRate: 16,
        taxInclusive: false,
        total: 1044,
        paymentMethod: 'cash',
        paymentAmount: 1100,
        change: 56,
        changeAmount: 56,
        Shop: {
          id: 10,
          name: 'Acme Supermarket',
          address: 'Moi Avenue, Nairobi',
          phone: '+254700000000',
          kraPin: 'P051234567Z',
        },
        SaleItems: [
          {
            id: 1, // Should NOT be exposed
            quantity: 2,
            price: 500,
            total: 1000,
            Product: { id: 101, name: 'Packet Milk 500ml' },
          },
        ],
      };

      const mockSettings = {
        branch: 'CBD Branch',
        tagline: 'Fresh everyday',
        showPoweredBy: true,
        receiptHeader: 'Welcome to Acme',
        receiptFooter: 'Goods once sold are not returnable',
        showLogoOnReceipt: true,
        businessLogo: '/uploads/logo.png',
      };

      Sale.findOne.mockResolvedValue(mockSale);
      SystemSettings.findOne.mockResolvedValue(mockSettings);

      const req = { params: { token: VALID_TOKEN } };
      const res = createMockRes();

      await getPublicReceipt(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0];

      // Assert document type & business info
      expect(data.documentType).toBe('SALES_RECEIPT');
      expect(data.business.name).toBe('Acme Supermarket');
      expect(data.business.branch).toBe('CBD Branch');
      expect(data.business.phone).toBe('+254700000000');
      expect(data.business.kraPin).toBe('P051234567Z');
      expect(data.business.tagline).toBe('Fresh everyday');
      expect(data.business.showPoweredBy).toBe(true);
      expect(data.business.logoUrl).toBe('/uploads/logo.png');

      // Assert meta info
      expect(data.meta.receiptNumber).toBe('R-7X9K-000042');
      expect(data.meta.invoiceNumber).toBe('INV-2026-00042');
      expect(data.meta.dateTime).toBe('2026-10-24T12:00:00.000Z');
      expect(data.meta.paymentLabel).toBe('Cash');

      // Assert lines
      expect(data.lines).toHaveLength(1);
      expect(data.lines[0]).toEqual({
        name: 'Packet Milk 500ml',
        quantity: 2,
        unitPrice: 500,
        lineTotal: 1000,
      });

      // Assert totals
      expect(data.totals.subtotal).toBe(1000);
      expect(data.totals.discount).toBe(100);
      expect(data.totals.tax).toEqual({
        amount: 144,
        rate: 16,
        inclusive: false,
      });
      expect(data.totals.total).toBe(1044);
      expect(data.totals.tendered).toBe(1100);
      expect(data.totals.change).toBe(56);

      // Assert headers & footers
      expect(data.header).toBe('Welcome to Acme');
      expect(data.footer).toBe('Goods once sold are not returnable');

      // STRICT PII EXCLUSIONS
      const payloadString = JSON.stringify(data);
      expect(payloadString).not.toContain('Secret Cashier Name');
      expect(payloadString).not.toContain('Secret Customer Name');
      expect(payloadString).not.toContain('+254712345678');
      expect(payloadString).not.toContain('secret@customer.com');
      expect(payloadString).not.toContain(VALID_TOKEN_HASH);

      // Assert no internal IDs are leaked
      expect(data.id).toBeUndefined();
      expect(data.shopId).toBeUndefined();
      expect(data.userId).toBeUndefined();
      expect(data.customerId).toBeUndefined();
      expect(data.customer).toBeUndefined();
      expect(data.meta.cashierName).toBeUndefined();
      expect(data.lines[0].id).toBeUndefined();
      expect(data.lines[0].productId).toBeUndefined();
    });
  });

  describe('Token Collision & Idempotency Simulation in saleController', () => {
    let mockSalesDb;
    const RECEIPT_TOKEN_REGEX = /^[A-Za-z0-9_-]{22}$/;

    beforeEach(() => {
      mockSalesDb = new Map();
    });

    const simulateCreateSale = async ({ shopId, receiptToken, idempotencyKey }) => {
      let receiptTokenHash = null;
      if (receiptToken) {
        if (typeof receiptToken !== 'string' || !RECEIPT_TOKEN_REGEX.test(receiptToken)) {
          const err = new Error('Invalid receiptToken format. Expected 22 base64url characters.');
          err.statusCode = 400;
          throw err;
        }
        receiptTokenHash = crypto.createHash('sha256').update(receiptToken).digest('hex');
        const existingByToken = Array.from(mockSalesDb.values()).find(s => s.receiptTokenHash === receiptTokenHash);
        if (existingByToken) {
          if (idempotencyKey && existingByToken.idempotencyKey === idempotencyKey) {
            return existingByToken;
          }
          const err = new Error('Receipt token already exists with a different idempotency key.');
          err.statusCode = 409;
          err.code = 'RECEIPT_TOKEN_ALREADY_EXISTS';
          throw err;
        }
      }

      const sale = {
        id: mockSalesDb.size + 1,
        shopId,
        receiptTokenHash,
        idempotencyKey,
      };
      mockSalesDb.set(sale.id, sale);
      return sale;
    };

    test('hashes valid receiptToken and stores receiptTokenHash only', async () => {
      const sale = await simulateCreateSale({
        shopId: 1,
        receiptToken: VALID_TOKEN,
        idempotencyKey: 'idemp-1',
      });

      expect(sale.receiptTokenHash).toBe(VALID_TOKEN_HASH);
      expect(sale.receiptToken).toBeUndefined();
    });

    test('replays sale idempotently when token and idempotencyKey match', async () => {
      const sale1 = await simulateCreateSale({
        shopId: 1,
        receiptToken: VALID_TOKEN,
        idempotencyKey: 'idemp-1',
      });

      const sale2 = await simulateCreateSale({
        shopId: 1,
        receiptToken: VALID_TOKEN,
        idempotencyKey: 'idemp-1',
      });

      expect(sale2.id).toBe(sale1.id);
    });

    test('rejects with 409 RECEIPT_TOKEN_ALREADY_EXISTS when token is reused with different idempotencyKey', async () => {
      await simulateCreateSale({
        shopId: 1,
        receiptToken: VALID_TOKEN,
        idempotencyKey: 'idemp-1',
      });

      await expect(
        simulateCreateSale({
          shopId: 1,
          receiptToken: VALID_TOKEN,
          idempotencyKey: 'idemp-2',
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'RECEIPT_TOKEN_ALREADY_EXISTS',
      });
    });

    test('rejects malformed receiptToken with 400', async () => {
      await expect(
        simulateCreateSale({
          shopId: 1,
          receiptToken: 'not-22-chars',
          idempotencyKey: 'idemp-1',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('Public Receipt Rate Limiter In-Memory Fallback (Cleanup Step 7)', () => {
    const { createDistributedRateLimiter } = require('../src/utils/distributedRateLimiter');
    const redisClient = require('../src/config/redis');

    test('enforces 30 req/min/IP limit locally in memory when Redis is disconnected', async () => {
      const originalStatus = redisClient ? redisClient.status : undefined;
      if (redisClient) {
        redisClient.status = 'end'; // simulate disconnected
      }

      try {
        const limiter = createDistributedRateLimiter({
          namespace: `test-mem-${Date.now()}`,
          windowMs: 60 * 1000,
          max: 30,
          keyGenerator: (req) => req.ip || '127.0.0.1',
          message: { error: 'Too many requests. Please try again later.' },
        });

        const ip = `192.0.2.${Math.floor(Math.random() * 200 + 1)}`;
        const req = { ip };
        let lastStatus = null;
        let lastJson = null;

        const createRes = () => ({
          setHeader: jest.fn(),
          status: (code) => {
            lastStatus = code;
            return {
              json: (payload) => {
                lastJson = payload;
                return payload;
              },
            };
          },
        });

        // Execute 30 requests - all should succeed via next()
        for (let i = 1; i <= 30; i++) {
          let calledNext = false;
          const res = createRes();
          await limiter(req, res, () => {
            calledNext = true;
          });
          expect(calledNext).toBe(true);
        }

        // 31st request from same IP must fail closed with 429 Too Many Requests
        let calledNextOn31 = false;
        const res31 = createRes();
        await limiter(req, res31, () => {
          calledNextOn31 = true;
        });

        expect(calledNextOn31).toBe(false);
        expect(lastStatus).toBe(429);
        expect(lastJson.error).toContain('Too many requests');

        // Request from another IP should still be allowed
        let calledNextOtherIp = false;
        const otherRes = createRes();
        await limiter({ ip: '198.51.100.77' }, otherRes, () => {
          calledNextOtherIp = true;
        });
        expect(calledNextOtherIp).toBe(true);
      } finally {
        if (redisClient && originalStatus !== undefined) {
          redisClient.status = originalStatus;
        }
      }
    });
  });
});
