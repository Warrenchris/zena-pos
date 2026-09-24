'use strict';

/**
 * Settings controller allowlist and persistence tests.
 * Verifies that:
 *   - taxRate (and other previously-missing fields) persists correctly.
 *   - Protected fields (id, shopId) cannot be overwritten via PUT /api/settings.
 *   - Masked M-Pesa secret placeholders do NOT overwrite stored encrypted values.
 */

const request = require('supertest');
const app = require('../src/app');
const { SystemSettings, Shop, Organization, User, ActivityLog } = require('../src/models');
const { encrypt, maskSecret } = require('../src/utils/encryption');

function tokenFor(user) {
  const jwt = require('jsonwebtoken');
  const fs = require('fs');
  const path = require('path');
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
        ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
        : '');
  return 'Bearer ' + jwt.sign(user, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Settings allowlist & persistence', () => {
  const SHOP_ID = 901; // Use a dedicated shop id that won't clash with other suites
  const USER_ID = 9001;
  let adminToken;

  beforeAll(async () => {
    adminToken = tokenFor({ id: USER_ID, role: 'admin', shopId: SHOP_ID });

    // Ensure the org, shop, user, and a clean settings row exist
    await Organization.findOrCreate({
      where: { id: 91 },
      defaults: { id: 91, name: 'Settings Test Org', slug: `settings-test-org-${Date.now()}`, status: 'active', currency: 'KES' }
    });
    await Shop.findOrCreate({
      where: { id: SHOP_ID },
      defaults: { id: SHOP_ID, name: 'Settings Test Shop', organizationId: 91, active: true }
    });
    await User.findOrCreate({
      where: { id: USER_ID },
      defaults: { id: USER_ID, name: 'Settings Admin', email: `settings-admin-${Date.now()}@example.com`, password: 'irrelevant', role: 'admin', shopId: SHOP_ID }
    });
    // Start from a known state
    await SystemSettings.destroy({ where: { shopId: SHOP_ID } });
  });

  afterAll(async () => {
    await ActivityLog.destroy({ where: { shopId: SHOP_ID } }).catch(() => {});
    await SystemSettings.destroy({ where: { shopId: SHOP_ID } }).catch(() => {});
  });

  // -------------------------------------------------------------------
  it('persists taxRate when sent in a PUT /api/settings request', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', adminToken)
      .send({ taxRate: 16 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const row = await SystemSettings.findOne({ where: { shopId: SHOP_ID } });
    expect(parseFloat(row.taxRate)).toBe(16);
  });

  // -------------------------------------------------------------------
  it('persists lowStockThreshold, skuPrefix, barcodeFormat, aiDigestFrequency', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', adminToken)
      .send({
        lowStockThreshold: 3,
        skuPrefix: 'TST',
        barcodeFormat: 'CODE128',
        aiDigestFrequency: 'daily'
      });

    expect(res.status).toBe(200);
    const row = await SystemSettings.findOne({ where: { shopId: SHOP_ID } });
    expect(row.lowStockThreshold).toBe(3);
    expect(row.skuPrefix).toBe('TST');
    expect(row.barcodeFormat).toBe('CODE128');
    expect(row.aiDigestFrequency).toBe('daily');
  });

  // -------------------------------------------------------------------
  it('does NOT overwrite shopId even when the body contains shopId: <other>', async () => {
    const OTHER_SHOP = 999;
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', adminToken)
      .send({ shopId: OTHER_SHOP, taxRate: 5 });

    expect(res.status).toBe(200);
    const row = await SystemSettings.findOne({ where: { shopId: SHOP_ID } });
    expect(row).not.toBeNull(); // row still belongs to SHOP_ID
    expect(row.shopId).toBe(SHOP_ID);
  });

  // -------------------------------------------------------------------
  it('does NOT overwrite id even when the body contains id: <other>', async () => {
    const row = await SystemSettings.findOne({ where: { shopId: SHOP_ID } });
    const originalId = row.id;

    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', adminToken)
      .send({ id: originalId + 9999, taxRate: 7 });

    expect(res.status).toBe(200);
    await row.reload();
    expect(row.id).toBe(originalId);
  });

  // -------------------------------------------------------------------
  it('does NOT overwrite stored encrypted M-Pesa secrets when masked placeholder is sent', async () => {
    // First, store a real secret
    const realSecret = 'super-secret-consumer-key-abc123';
    const encrypted = encrypt(realSecret);
    const row = await SystemSettings.findOne({ where: { shopId: SHOP_ID } });
    await row.update({ consumerKey: encrypted });

    // Now save with the masked placeholder that the UI echoes back
    const masked = maskSecret(encrypted);
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', adminToken)
      .send({ consumerKey: masked, taxRate: 8 });

    expect(res.status).toBe(200);
    await row.reload();
    // The encrypted value in the DB must be unchanged
    expect(row.consumerKey).toBe(encrypted);
  });
});
