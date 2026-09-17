'use strict';
const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop, Category, Product, Sale, SaleItem, User, PendingPayment, Organization
} = require('../src/models');
const SalePayment = require('../src/models/SalePayment');
const axios = require('axios');
const jwt = require('jsonwebtoken');

jest.mock('axios');

function tokenFor(user) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(user, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('SEC-01: M-Pesa Security & Cryptographic Callback Authentication', () => {
  let shop;
  let category;
  let product;
  let userToken;

  beforeAll(async () => {
    process.env.MPESA_CONSUMER_KEY = 'mock_consumer_key';
    process.env.MPESA_CONSUMER_SECRET = 'mock_consumer_secret';
    process.env.MPESA_SHORTCODE = '174379';
    process.env.MPESA_PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
    process.env.MPESA_CALLBACK_URL = 'https://api.zenapos.com/api/mpesa/callback';

    // Find or create test shop
    shop = await Shop.findByPk(1);
    if (!shop) {
      const org = await Organization.create({
        name: 'SEC01 Test Org',
        slug: `sec01-org-${Date.now()}`,
        status: 'active'
      });
      shop = await Shop.create({
        id: 1,
        name: 'SEC01 Test Shop',
        organizationId: org.id,
        active: true
      });
    }

    // Find or create Category
    category = await Category.findOne({ where: { shopId: 1 } });
    if (!category) {
      category = await Category.create({
        name: 'Security Test Category',
        shopId: 1
      });
    }

    // Find or create Product
    product = await Product.findOne({ where: { shopId: 1, name: 'Security Test Item' } });
    if (!product) {
      product = await Product.create({
        name: 'Security Test Item',
        price: 50.00,
        costPrice: 20.00,
        stockQuantity: 100,
        categoryId: category.id,
        shopId: 1
      });
    }

    userToken = tokenFor({ id: 999, role: 'admin', shopId: 1 });
  });

  afterAll(async () => {
    await PendingPayment.destroy({ where: { shopId: 1, orderId: { [Op.like]: 'sec01_%' } } });
  });

  describe('1. POS M-Pesa Initiation & Token Generation', () => {
    it('should generate single-use callbackToken on initiation and persist in saleData', async () => {
      axios.get.mockResolvedValueOnce({
        data: { access_token: 'mock_daraja_access_token' }
      });
      axios.post.mockResolvedValueOnce({
        data: {
          CheckoutRequestID: 'ws_CO_SEC01_INIT_123',
          CustomerMessage: 'Success. Request accepted for processing'
        }
      });

      const res = await request(app)
        .post('/api/mpesa/initiate')
        .set('Authorization', userToken)
        .send({
          phone: '0712345678',
          amount: 50.00,
          orderId: 'sec01_order_init_1',
          saleData: {
            items: [{ productId: product.id, quantity: 1, price: 50.00 }],
            total: 50.00
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.checkoutRequestId).toBe('ws_CO_SEC01_INIT_123');

      // Verify pending payment stored with token
      const pending = await PendingPayment.findOne({
        where: { checkoutRequestId: 'ws_CO_SEC01_INIT_123' }
      });
      expect(pending).not.toBeNull();
      expect(pending.status).toBe('pending');
      expect(pending.saleData).toBeDefined();
      expect(pending.saleData.callbackToken).toBeDefined();
      expect(pending.saleData.callbackToken.length).toBe(64); // 32 bytes hex
    });
  });

  describe('2. Callback Rejections: Missing and Invalid Tokens', () => {
    const checkoutId = 'ws_CO_SEC01_REJECT_TEST';
    const legitimateToken = 'legitimate_secret_token_1234567890abcdef1234567890abcdef12345678';

    beforeEach(async () => {
      await PendingPayment.destroy({ where: { checkoutRequestId: checkoutId } });
      await PendingPayment.create({
        checkoutRequestId: checkoutId,
        orderId: 'sec01_order_reject',
        amount: 50.00,
        status: 'pending',
        paymentChannel: 'mpesa',
        shopId: 1,
        saleData: {
          callbackToken: legitimateToken,
          items: [{ productId: product.id, quantity: 1, price: 50.00 }],
          total: 50.00
        }
      });
    });

    it('should reject callback with missing query token (401 Unauthorized)', async () => {
      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 50.00 },
                { Name: 'MpesaReceiptNumber', Value: 'SPOOFED_RECEIPT' }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post('/api/mpesa/callback')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/missing verification token/i);

      // Verify payment was NOT confirmed
      const pending = await PendingPayment.findOne({ where: { checkoutRequestId: checkoutId } });
      expect(pending.status).toBe('pending');
    });

    it('should reject callback with forged/invalid token (401 Unauthorized)', async () => {
      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 50.00 },
                { Name: 'MpesaReceiptNumber', Value: 'SPOOFED_RECEIPT' }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post('/api/mpesa/callback?token=completely_wrong_forged_token')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid verification token/i);

      // Verify payment was NOT confirmed
      const pending = await PendingPayment.findOne({ where: { checkoutRequestId: checkoutId } });
      expect(pending.status).toBe('pending');
    });
  });

  describe('3. Legitimate Callback Processing & Idempotency', () => {
    const checkoutId = 'ws_CO_SEC01_SUCCESS_TEST';
    const legitimateToken = 'valid_secret_token_1234567890abcdef1234567890abcdef1234567890abcdef';
    const mpesaReceipt = 'SEC01_RCPT_9999';

    beforeAll(async () => {
      await PendingPayment.destroy({ where: { checkoutRequestId: checkoutId } });
      await PendingPayment.create({
        checkoutRequestId: checkoutId,
        orderId: 'sec01_order_success',
        amount: 50.00,
        status: 'pending',
        paymentChannel: 'mpesa',
        shopId: 1,
        saleData: {
          callbackToken: legitimateToken,
          items: [{ productId: product.id, quantity: 1, price: 50.00 }],
          total: 50.00,
          paymentAmount: 50.00,
          paymentMethod: 'mobile',
          userId: 999
        }
      });
    });

    afterAll(async () => {
      const sale = await Sale.findOne({ where: { paymentReference: mpesaReceipt, shopId: 1 } });
      if (sale) {
        await SalePayment.destroy({ where: { saleId: sale.id } });
        await SaleItem.destroy({ where: { saleId: sale.id } });
        await Sale.destroy({ where: { id: sale.id } });
      }
    });

    it('should successfully confirm payment and create sale when token is authentic', async () => {
      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 50.00 },
                { Name: 'MpesaReceiptNumber', Value: mpesaReceipt }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post(`/api/mpesa/callback?token=${legitimateToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/processed successfully/i);

      // Verify pending payment marked confirmed
      const pending = await PendingPayment.findOne({ where: { checkoutRequestId: checkoutId } });
      expect(pending.status).toBe('confirmed');

      // Verify sale created with matching receipt
      const sale = await Sale.findOne({ where: { paymentReference: mpesaReceipt, shopId: 1 } });
      expect(sale).not.toBeNull();
      expect(Number(sale.total)).toBe(50.00);
    });

    it('should be strictly idempotent on duplicate callback replay', async () => {
      const countBefore = await Sale.count({ where: { paymentReference: mpesaReceipt, shopId: 1 } });

      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: checkoutId,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 50.00 },
                { Name: 'MpesaReceiptNumber', Value: mpesaReceipt }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post(`/api/mpesa/callback?token=${legitimateToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/already processed/i);

      const countAfter = await Sale.count({ where: { paymentReference: mpesaReceipt, shopId: 1 } });
      expect(countAfter).toBe(countBefore);
    });
  });
});
