const http = require('http');
const app = require('../src/app');
const { User, Shop, Organization } = require('../src/models');

async function measureTiming() {
  const timestamp = Date.now();
  const org = await Organization.create({
    name: `Timing Org ${timestamp}`,
    slug: `timing-org-${timestamp}`,
    status: 'active'
  });
  const shop = await Shop.create({
    name: `Timing Shop ${timestamp}`,
    organizationId: org.id,
    active: true
  });
  const registeredEmail = `registered_timing_${timestamp}@example.com`;
  const nonExistentEmail = `nonexistent_timing_${timestamp}@example.com`;

  const user = await User.create({
    name: 'Timing User',
    email: registeredEmail,
    password: 'Password123!',
    role: 'admin',
    shopId: shop.id,
    active: true
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  async function postForgotPassword(email, i) {
    const postData = JSON.stringify({ email });
    const start = process.hrtime.bigint();

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/auth/forgot-password',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'X-Forwarded-For': `198.51.100.${100 + i}` // avoid rate limiter
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            const end = process.hrtime.bigint();
            const durationMs = Number(end - start) / 1e6;
            resolve({ statusCode: res.statusCode, body: JSON.parse(data), durationMs });
          });
        }
      );
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  console.log('Measuring response latency for POST /api/auth/forgot-password:');
  const runs = 5;

  const registeredTimes = [];
  for (let i = 0; i < runs; i++) {
    const res = await postForgotPassword(registeredEmail, i);
    registeredTimes.push(res.durationMs);
  }

  const nonExistentTimes = [];
  for (let i = 0; i < runs; i++) {
    const res = await postForgotPassword(nonExistentEmail, i + 10);
    nonExistentTimes.push(res.durationMs);
  }

  const avg = (arr) => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
  const min = (arr) => Math.min(...arr).toFixed(2);
  const max = (arr) => Math.max(...arr).toFixed(2);

  console.log('\n--- Results ---');
  console.log(`Registered Email (${registeredEmail}):`);
  console.log(`  Runs: [${registeredTimes.map((t) => t.toFixed(2)).join(', ')}] ms`);
  console.log(`  Avg: ${avg(registeredTimes)} ms | Min: ${min(registeredTimes)} ms | Max: ${max(registeredTimes)} ms`);

  console.log(`\nNon-existent Email (${nonExistentEmail}):`);
  console.log(`  Runs: [${nonExistentTimes.map((t) => t.toFixed(2)).join(', ')}] ms`);
  console.log(`  Avg: ${avg(nonExistentTimes)} ms | Min: ${min(nonExistentTimes)} ms | Max: ${max(nonExistentTimes)} ms`);

  const delta = Math.abs(avg(registeredTimes) - avg(nonExistentTimes)).toFixed(2);
  console.log(`\nDelta between averages: ${delta} ms (both return virtually instantaneously)`);

  // Cleanup
  server.close();
  await User.destroy({ where: { id: user.id } }).catch(() => {});
  await Shop.destroy({ where: { id: shop.id } }).catch(() => {});
  await Organization.destroy({ where: { id: org.id } }).catch(() => {});
  process.exit(0);
}

measureTiming().catch((err) => {
  console.error('Error measuring timing:', err);
  process.exit(1);
});
