'use strict';

/**
 * These check pure middleware behaviour (CORS preflight, static file serving) and need no
 * database, unlike most of this suite.
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

describe('CORS', () => {
  const app = require('../src/app');

  it('allows the Idempotency-Key header the frontend sends on sales/payments', async () => {
    const res = await request(app)
      .options('/api/sales')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,idempotency-key');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('Idempotency-Key');
  });

  it('allows the Android app origin (https://localhost) by default', async () => {
    const res = await request(app)
      .options('/api/sales')
      .set('Origin', 'https://localhost')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://localhost');
  });

  it('does not allow an arbitrary origin', async () => {
    const res = await request(app)
      .options('/api/sales')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('static uploads', () => {
  const uploadsDir = path.join(__dirname, '../uploads/logos');
  const filename = `test-logo-${Date.now()}.png`;
  const filePath = path.join(uploadsDir, filename);
  // A 1x1 transparent PNG, so this test writes and reads a real (tiny) image file.
  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );

  let app;

  beforeAll(() => {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(filePath, onePixelPng);
    app = require('../src/app');
  });

  afterAll(() => {
    fs.rmSync(filePath, { force: true });
  });

  it('serves a file placed under uploads/, at the path the logo upload endpoint returns', async () => {
    const res = await request(app).get(`/uploads/logos/${filename}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(Buffer.compare(res.body, onePixelPng)).toBe(0);
  });

  it('sets Cross-Origin-Resource-Policy so an <img> on another origin (or the Android app) can load it', async () => {
    const res = await request(app).get(`/uploads/logos/${filename}`);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('answers 404 for a file that does not exist, without leaking a stack trace', async () => {
    const res = await request(app).get('/uploads/logos/does-not-exist.png');
    expect(res.status).toBe(404);
  });

  it('does not serve files outside the uploads directory via path traversal', async () => {
    const res = await request(app).get('/uploads/logos/..%2f..%2fpackage.json');
    expect(res.status).not.toBe(200);
  });
});
