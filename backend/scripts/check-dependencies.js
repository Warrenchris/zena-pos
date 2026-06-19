const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const pkgPath = path.join(ROOT, 'package.json');

if (!fs.existsSync(pkgPath)) {
  console.error('[check-dependencies] package.json not found at', pkgPath);
  process.exit(1);
}

const pkg = require(pkgPath);
const dependencies = Object.keys(pkg.dependencies || {});

const CRITICAL_FIRST = [
  'express',
  'express-rate-limit',
  'cors',
  'helmet',
  'morgan',
  'sequelize',
  'mysql2',
  'jsonwebtoken',
  'axios',
  'node-cache',
  'dotenv',
  'bcryptjs',
  'express-validator',
];

const toCheck = [...new Set([...CRITICAL_FIRST, ...dependencies])];
const missing = [];
const resolved = [];

for (const name of toCheck) {
  try {
    require.resolve(name, { paths: [ROOT] });
    resolved.push(name);
  } catch {
    missing.push(name);
  }
}

if (missing.length > 0) {
  console.error('[check-dependencies] FAILED - missing packages:');
  missing.forEach((name) => console.error('  - ' + name));
  console.error('[check-dependencies] Run: npm install');
  process.exit(1);
}

console.log('[check-dependencies] OK - ' + resolved.length + ' packages resolved.');