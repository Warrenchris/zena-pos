const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const REQUIRED_ENV_VARS = [
  'JWT_PRIVATE_KEY',
  'JWT_PUBLIC_KEY',
  'DB_NAME',
  'DB_USER',
  'DB_PASS',
];

const CRITICAL_MODULES = [
  'express',
  'express-rate-limit',
  'cors',
  'helmet',
  'sequelize',
  'mysql2',
  'jsonwebtoken',
  'axios',
  'node-cache',
];

function validateStartup() {
  const root = path.join(__dirname, '../..');
  const diagnostics = {
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    dbHost: process.env.DB_HOST || '127.0.0.1',
    dbName: process.env.DB_NAME || '(not set)',
    checks: [],
  };

  logger.info('[startup] Running pre-flight validation...', {
    node: diagnostics.nodeVersion,
    env: diagnostics.environment,
  });

  const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    diagnostics.checks.push({ name: 'environment', ok: false, missing: missingEnv });
    logger.error('[startup] Missing required environment variables:', missingEnv.join(', '));
    throw new Error('Missing required environment variables: ' + missingEnv.join(', '));
  }
  diagnostics.checks.push({ name: 'environment', ok: true });

  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error('package.json not found at ' + pkgPath);
  }
  diagnostics.checks.push({ name: 'package.json', ok: true });

  const missingModules = [];
  for (const mod of CRITICAL_MODULES) {
    try {
      require.resolve(mod, { paths: [root] });
    } catch {
      missingModules.push(mod);
    }
  }

  if (missingModules.length > 0) {
    diagnostics.checks.push({ name: 'modules', ok: false, missing: missingModules });
    logger.error('[startup] Missing Node modules:', missingModules.join(', '));
    logger.error('[startup] If running in Docker, run: docker compose exec backend npm install');
    logger.error('[startup] Or reset volumes: ./scripts/reset-dev.sh');
    throw new Error('Missing required modules: ' + missingModules.join(', '));
  }
  diagnostics.checks.push({ name: 'modules', ok: true, count: CRITICAL_MODULES.length });

  logger.info('[startup] Pre-flight validation passed.', diagnostics);
  return diagnostics;
}

module.exports = { validateStartup, REQUIRED_ENV_VARS, CRITICAL_MODULES };