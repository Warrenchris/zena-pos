const { sequelize, Organization, Subscription, Plan } = require('./src/models');

async function verifyGrandfathering() {
  console.log('=== VERIFICATION 3: GRANDFATHERING BACKFILL CORRECTNESS ===');

  const [orgCountResult] = await sequelize.query('SELECT COUNT(*) as orgCount FROM Organizations');
  const orgCount = orgCountResult[0].orgCount;

  const [subCountResult] = await sequelize.query('SELECT COUNT(*) as subCount FROM Subscriptions');
  const subCount = subCountResult[0].subCount;

  console.log(`COUNT(Organizations): ${orgCount}`);
  console.log(`COUNT(Subscriptions): ${subCount}`);
  console.log(`COUNT(Organizations) === COUNT(Subscriptions): ${orgCount === subCount}`);

  // Query grandfathered plan ID
  const [gfPlanResult] = await sequelize.query("SELECT id, name, code, maxShops, maxUsers, isActive FROM Plans WHERE code = 'grandfathered'");
  const gfPlan = gfPlanResult[0];
  console.log('Grandfathered Plan Record:', gfPlan);

  // Check all organizations and their subscriptions
  const [rows] = await sequelize.query(`
    SELECT 
      o.id as orgId,
      o.name as orgName,
      o.status as orgStatus,
      s.id as subId,
      s.status as subStatus,
      s.billingCycle,
      s.currentPeriodEnd,
      s.trialEndsAt,
      p.code as planCode
    FROM Organizations o
    LEFT JOIN Subscriptions s ON s.organizationId = o.id
    LEFT JOIN Plans p ON s.planId = p.id
    ORDER BY o.id ASC
  `);

  console.log('\n--- Organization to Subscription Mapping ---');
  let allGrandfatheredCorrectly = true;
  for (const r of rows) {
    const isOk = r.subId !== null &&
                 r.subStatus === 'active' &&
                 r.planCode === 'grandfathered' &&
                 new Date(r.currentPeriodEnd) > new Date('2099-01-01') &&
                 r.trialEndsAt === null;
    if (!isOk) allGrandfatheredCorrectly = false;
    console.log(`Org ID ${r.orgId} (${r.orgName}): SubID=${r.subId}, Status=${r.subStatus}, Plan=${r.planCode}, PeriodEnd=${r.currentPeriodEnd}, TrialEndsAt=${r.trialEndsAt} -> OK: ${isOk}`);
  }

  // Check orphans in either direction
  const [orphanedOrgs] = await sequelize.query(`
    SELECT o.id FROM Organizations o
    LEFT JOIN Subscriptions s ON s.organizationId = o.id
    WHERE s.id IS NULL
  `);

  const [orphanedSubs] = await sequelize.query(`
    SELECT s.id, s.organizationId FROM Subscriptions s
    LEFT JOIN Organizations o ON s.organizationId = o.id
    WHERE o.id IS NULL
  `);

  console.log(`\nOrphaned Organizations (no subscription): ${orphanedOrgs.length}`);
  console.log(`Orphaned Subscriptions (no organization): ${orphanedSubs.length}`);
  console.log(`All Grandfathered Correctly: ${allGrandfatheredCorrectly && orgCount === subCount && orphanedOrgs.length === 0 && orphanedSubs.length === 0}`);

  process.exit(0);
}

verifyGrandfathering().catch(err => {
  console.error(err);
  process.exit(1);
});
