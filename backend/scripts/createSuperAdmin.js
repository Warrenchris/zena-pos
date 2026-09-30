'use strict';

require('dotenv').config();
const { User, sequelize } = require('../src/models');
const { isBcryptHash } = require('../src/utils/passwordUtils');
const bcrypt = require('bcryptjs');

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain both letters and numbers';
  }
  return null;
}

async function createSuperAdmin(options = {}) {
  const cliArgs = parseArgs();
  const email = (options.email || cliArgs.email || process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  const name = (options.name || cliArgs.name || process.env.SUPERADMIN_NAME || 'Platform Operator').trim();
  const password = options.password || cliArgs.password || process.env.SUPERADMIN_PASSWORD;

  if (!email || !email.includes('@')) {
    throw new Error('Valid email is required (pass --email <email>)');
  }

  if (!name) {
    throw new Error('Name is required (pass --name <name>)');
  }

  const pwdError = validatePassword(password);
  if (pwdError) {
    throw new Error(`${pwdError} (pass --password <password>)`);
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    if (existing.role === 'super_admin') {
      console.log(`[createSuperAdmin] Super-admin with email "${email}" already exists (ID: ${existing.id}).`);
      return existing;
    }
    throw new Error(`User with email "${email}" already exists with role "${existing.role}". Cannot convert tenant user to super-admin.`);
  }

  const hashedPassword = await bcrypt.hash(password, 8);

  const superAdmin = await User.create({
    name,
    email,
    password: hashedPassword,
    role: 'super_admin',
    shopId: null,
    active: true,
    emailVerifiedAt: new Date()
  });

  console.log(`[createSuperAdmin] Successfully provisioned platform super-admin:`);
  console.log(`  ID: ${superAdmin.id}`);
  console.log(`  Name: ${superAdmin.name}`);
  console.log(`  Email: ${superAdmin.email}`);
  console.log(`  Role: ${superAdmin.role}`);
  console.log(`  ShopId: ${superAdmin.shopId}`);
  console.log(`  Email Verified: true`);

  return superAdmin;
}

if (require.main === module) {
  createSuperAdmin()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[createSuperAdmin] ERROR: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { createSuperAdmin, validatePassword };
