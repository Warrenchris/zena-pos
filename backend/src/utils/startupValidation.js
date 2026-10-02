const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getFrontendUrlProblems } = require('./frontendUrl');

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

  // Server runtime must never run in test mode (which bypasses schedulers, rate limits, and audit logs)
  if (process.env.NODE_ENV === 'test') {
    diagnostics.checks.push({ name: 'environment', ok: false, error: 'NODE_ENV cannot be set to "test" for running servers' });
    logger.error('[startup] NODE_ENV cannot be set to "test" when starting the server.');
    throw new Error('NODE_ENV cannot be set to "test" when starting the server.');
  }

  const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    diagnostics.checks.push({ name: 'environment', ok: false, missing: missingEnv });
    logger.error('[startup] Missing required environment variables:', missingEnv.join(', '));
    throw new Error('Missing required environment variables: ' + missingEnv.join(', '));
  }
  diagnostics.checks.push({ name: 'environment', ok: true });

  // Emailed links (verification, password reset) are built from FRONTEND_URL.
  // In production a missing/localhost value would ship dead links, so fail fast.
  const frontendUrlProblems = getFrontendUrlProblems();
  if (frontendUrlProblems.length > 0) {
    diagnostics.checks.push({ name: 'frontendUrl', ok: false, problems: frontendUrlProblems });
    logger.error('[startup] Invalid FRONTEND_URL:', frontendUrlProblems.join('; '));
    throw new Error('Invalid FRONTEND_URL: ' + frontendUrlProblems.join('; '));
  }
  diagnostics.checks.push({ name: 'frontendUrl', ok: true });

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

  // B6: Non-fatal email configuration check (A2: inline check — no emailService import,
  // which would run transporter.verify() and interfere with the test harness).
  // Never throws; always pushes ok: true so existing health/pass-fail logic is unaffected.
  const smtpBasicConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
  if (process.env.NODE_ENV === 'production') {
    if (!smtpBasicConfigured) {
      logger.error(
        '[startup] SMTP is not configured in production — verification, password-reset, and billing ' +
        'emails will NOT be sent. Set SMTP_HOST and SMTP_PORT to enable email delivery.'
      );
      diagnostics.checks.push({ name: 'email', ok: true, configured: false, warn: 'SMTP_HOST and SMTP_PORT are missing' });
    } else {
      const missingSmtpCreds = ['SMTP_FROM', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
      if (missingSmtpCreds.length > 0) {
        logger.warn(
          '[startup] SMTP host/port set but credentials incomplete — email delivery may fail. Missing: ' +
          missingSmtpCreds.join(', ')
        );
        diagnostics.checks.push({ name: 'email', ok: true, configured: true, warn: 'missing: ' + missingSmtpCreds.join(', ') });
      } else {
        diagnostics.checks.push({ name: 'email', ok: true, configured: true });
      }
    }
  } else {
    diagnostics.checks.push({ name: 'email', ok: true, configured: smtpBasicConfigured });
  }

  logger.info('[startup] Pre-flight validation passed.', diagnostics);
  return diagnostics;
}

module.exports = { validateStartup, REQUIRED_ENV_VARS, CRITICAL_MODULES };