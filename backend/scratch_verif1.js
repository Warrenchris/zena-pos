'use strict';

const { execSync } = require('child_process');
const { Organization, RolePermission, Permission, sequelize } = require('./src/models');

async function main() {
  console.log('--- STARTING VERIFICATION 1: MIGRATION UP & DOWN ---');

  // 1. Revert to test starting from pre-migration state
  console.log('Reverting 20260928000000 migration...');
  execSync('npx sequelize-cli db:migrate:undo', { stdio: 'inherit' });

  const ts = Date.now();
  // 2. Create one seeded org (simulating org seeded prior to this migration) and one unseeded org
  const seededOrg = await Organization.create({
    name: `Seed Verification Org ${ts}`,
    slug: `seed-verif-${ts}`,
    status: 'active'
  });

  const unseededOrg = await Organization.create({
    name: `Unseed Verification Org ${ts}`,
    slug: `unseed-verif-${ts}`,
    status: 'active'
  });

  // Seed seededOrg with some permissions (excluding view_own_sales)
  const existingPerms = await Permission.findAll({ limit: 5 });
  for (const p of existingPerms) {
    await RolePermission.create({
      organizationId: seededOrg.id,
      role: 'cashier',
      permissionId: p.id
    });
    await RolePermission.create({
      organizationId: seededOrg.id,
      role: 'admin',
      permissionId: p.id
    });
  }

  const countSeededBefore = await RolePermission.count({ where: { organizationId: seededOrg.id } });
  const countUnseededBefore = await RolePermission.count({ where: { organizationId: unseededOrg.id } });

  console.log(`BEFORE MIGRATION:
  - Seeded Org (ID ${seededOrg.id}) RolePermissions count: ${countSeededBefore}
  - Unseeded Org (ID ${unseededOrg.id}) RolePermissions count: ${countUnseededBefore}`);

  // 3. Run migration up
  console.log('Running npx sequelize-cli db:migrate (UP)...');
  execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' });

  const countSeededAfter = await RolePermission.count({ where: { organizationId: seededOrg.id } });
  const countUnseededAfter = await RolePermission.count({ where: { organizationId: unseededOrg.id } });

  console.log(`AFTER MIGRATION UP:
  - Seeded Org (ID ${seededOrg.id}) RolePermissions count: ${countSeededAfter} (increased by ${countSeededAfter - countSeededBefore})
  - Unseeded Org (ID ${unseededOrg.id}) RolePermissions count: ${countUnseededAfter}`);

  // 4. Test migration down
  console.log('Testing npx sequelize-cli db:migrate:undo (DOWN)...');
  execSync('npx sequelize-cli db:migrate:undo', { stdio: 'inherit' });

  const countSeededAfterDown = await RolePermission.count({ where: { organizationId: seededOrg.id } });
  const countUnseededAfterDown = await RolePermission.count({ where: { organizationId: unseededOrg.id } });

  console.log(`AFTER MIGRATION DOWN (UNDO):
  - Seeded Org (ID ${seededOrg.id}) RolePermissions count: ${countSeededAfterDown}
  - Unseeded Org (ID ${unseededOrg.id}) RolePermissions count: ${countUnseededAfterDown}`);

  // 5. Migrate up again so DB is in the migrated state
  console.log('Re-migrating UP to leave DB updated...');
  execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' });

  // Cleanup test orgs
  await RolePermission.destroy({ where: { organizationId: seededOrg.id } });
  await seededOrg.destroy();
  await unseededOrg.destroy();

  console.log('--- VERIFICATION 1 COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

main().catch(err => {
  console.error('Verification 1 failed:', err);
  process.exit(1);
});
