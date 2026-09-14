const request = require('supertest');
const app = require('./src/app');
const {
  sequelize,
  Organization,
  Subscription,
  Plan,
  User,
  Shop,
  OrganizationMembership
} = require('./src/models');
const entitlementService = require('./src/services/entitlementService');
const redisClient = require('./src/config/redis');

async function runVerifications() {
  console.log('================================================================');
  console.log('STARTING SUB-PHASE 6a VERIFICATION SUITE: ITEMS 4, 5, 6');
  console.log('================================================================\n');

  // ============================================================================
  // VERIFICATION 4: New-organization path is NOT retroactively grandfathered
  // ============================================================================
  console.log('=== VERIFICATION 4: NEW-ORGANIZATION PATH IS NOT GRANDFATHERED ===');
  const timestamp = Date.now();
  const testEmail = `newmerchant-${timestamp}@example.com`;
  const shopName = `Post-Migration Shop ${timestamp}`;

  const regRes = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Post Migration Merchant',
      email: testEmail,
      password: 'password123',
      role: 'admin',
      shop: {
        name: shopName,
        address: 'Nairobi CBD',
        phone: '+254712345678'
      }
    });

  if (regRes.status !== 201) {
    console.error('Registration failed:', regRes.status, regRes.body);
    process.exit(1);
  }

  const createdOrgId = regRes.body.user.shop.organizationId;
  const createdUserId = regRes.body.user.id;
  const createdShopId = regRes.body.user.shop.id;
  console.log(`Registered new merchant: User ID=${createdUserId}, Shop ID=${createdShopId}, Org ID=${createdOrgId}`);

  // Query Subscriptions table for this newly registered organization
  const newOrgSubscription = await Subscription.findOne({
    where: { organizationId: createdOrgId }
  });

  console.log(`Querying Subscription for newly registered Org ID ${createdOrgId}:`, newOrgSubscription);
  const hasNoSubscription = newOrgSubscription === null;
  console.log(`Subscription is NULL for post-migration registration: ${hasNoSubscription}`);
  if (!hasNoSubscription) {
    throw new Error('UNEXPECTED: New organization has a subscription row! It should NOT be grandfathered.');
  }
  console.log('-> Confirmed: Gap is expected at Sub-Phase 6a (registration subscription creation is deferred to Sub-Phase 6c).\n');

  // ============================================================================
  // VERIFICATION 5: entitlementService.canUseFeature & checkQuota real function calls
  // ============================================================================
  console.log('=== VERIFICATION 5: ENTITLEMENT SERVICE DIRECT FUNCTION VERIFICATION ===');

  // Case A: Grandfathered Organization (Org 1)
  console.log('\n--- Case A: Grandfathered Organization (Org 1) ---');
  await entitlementService.invalidateOrgEntitlements(1); // ensure clean cache
  const gfFeatureCheck = await entitlementService.canUseFeature(1, 'org_insights');
  console.log('Org 1 canUseFeature("org_insights"):', gfFeatureCheck);
  console.log('Org 1 canUseFeature allowed boolean:', gfFeatureCheck.allowed);

  const gfQuotaCheck = await entitlementService.checkQuota(1, 'maxShops', 10);
  console.log('Org 1 checkQuota("maxShops", currentCount=10):', gfQuotaCheck);
  console.log('Org 1 checkQuota allowed boolean:', gfQuotaCheck.allowed, 'limit:', gfQuotaCheck.limit);

  const gfUserQuotaCheck = await entitlementService.checkQuota(1, 'maxUsers', 50);
  console.log('Org 1 checkQuota("maxUsers", currentCount=50):', gfUserQuotaCheck);
  console.log('Org 1 checkQuota allowed boolean:', gfUserQuotaCheck.allowed, 'limit:', gfUserQuotaCheck.limit);

  if (!gfFeatureCheck.allowed || !gfQuotaCheck.allowed || gfQuotaCheck.limit !== -1) {
    throw new Error('Grandfathered organization checks failed!');
  }

  // Case B: Starter Plan Organization
  console.log('\n--- Case B: Hypothetical Organization on Starter Plan ---');
  // Find the starter plan
  const starterPlan = await Plan.findOne({ where: { code: 'starter' } });
  console.log('Starter Plan:', {
    id: starterPlan.id,
    code: starterPlan.code,
    maxShops: starterPlan.maxShops,
    maxUsers: starterPlan.maxUsers,
    features: starterPlan.features
  });

  // Create a temporary starter subscription for our test organization (createdOrgId)
  const starterSub = await Subscription.create({
    organizationId: createdOrgId,
    planId: starterPlan.id,
    status: 'active',
    billingCycle: 'monthly',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    trialEndsAt: null
  });
  await entitlementService.invalidateOrgEntitlements(createdOrgId);

  // Check Starter quotas & features
  const starterQuotaOk = await entitlementService.checkQuota(createdOrgId, 'maxShops', 0);
  console.log('Starter Org checkQuota("maxShops", currentCount=0) [below limit]:', starterQuotaOk);

  const starterQuotaExceeded = await entitlementService.checkQuota(createdOrgId, 'maxShops', 1);
  console.log('Starter Org checkQuota("maxShops", currentCount=1) [at limit=1]:', starterQuotaExceeded);

  const starterFeatureDenied = await entitlementService.canUseFeature(createdOrgId, 'org_insights');
  console.log('Starter Org canUseFeature("org_insights") [ungranted feature]:', starterFeatureDenied);

  if (starterQuotaExceeded.allowed !== false || starterFeatureDenied.allowed !== false) {
    throw new Error('Starter tier gating enforcement failed!');
  }

  // Case C: Organization with ZERO Subscription Row
  console.log('\n--- Case C: Organization with ZERO Subscription Row ---');
  // Remove the subscription row for createdOrgId
  await starterSub.destroy();
  await entitlementService.invalidateOrgEntitlements(createdOrgId);

  const zeroSubFeature = await entitlementService.canUseFeature(createdOrgId, 'org_insights');
  console.log('Zero-Subscription Org canUseFeature("org_insights"):', zeroSubFeature);
  console.log('Zero-Subscription Org allowed boolean:', zeroSubFeature.allowed);

  const zeroSubQuota = await entitlementService.checkQuota(createdOrgId, 'maxShops', 1);
  console.log('Zero-Subscription Org checkQuota("maxShops", 1):', zeroSubQuota);
  console.log('Zero-Subscription Org allowed boolean:', zeroSubQuota.allowed);

  if (zeroSubFeature.allowed !== false || zeroSubQuota.allowed !== false) {
    throw new Error('SECURITY VIOLATION: Zero-subscription org was silently allowed!');
  }
  console.log('-> Confirmed: Organization with zero subscription row is explicitly DEFAULT-DENIED (not silently allowed).\n');

  // ============================================================================
  // VERIFICATION 6: Redis Cache Behavior & Hit Verification
  // ============================================================================
  console.log('=== VERIFICATION 6: REDIS CACHE BEHAVIOR VERIFICATION ===');
  const orgIdForCache = 1;
  const cacheKey = `cache:entitlements:org:${orgIdForCache}`;

  // Step 1: Invalidate cache to guarantee clean state
  await entitlementService.invalidateOrgEntitlements(orgIdForCache);
  const cacheBefore = await redisClient.get(cacheKey);
  console.log(`Cache key "${cacheKey}" before calls:`, cacheBefore);

  // Step 2: Track database queries during Call 1 and Call 2 via Subscription.findOne spy
  let dbQueriesCall1 = 0;
  let dbQueriesCall2 = 0;
  let activeCall = 0;

  const originalFindOne = Subscription.findOne;
  Subscription.findOne = async function(...args) {
    if (activeCall === 1) dbQueriesCall1++;
    if (activeCall === 2) dbQueriesCall2++;
    return originalFindOne.apply(this, args);
  };

  // Call 1: Should MISS Redis cache and query DB
  console.log('\nExecuting Call 1 (Expecting Cache MISS -> DB Query -> Set Redis)...');
  activeCall = 1;
  const res1 = await entitlementService.canUseFeature(orgIdForCache, 'org_insights');
  activeCall = 0;

  const cacheAfterCall1 = await redisClient.get(cacheKey);
  console.log(`Call 1 Result:`, res1);
  console.log(`DB Queries on Subscription.findOne during Call 1: ${dbQueriesCall1}`);
  console.log(`Redis Cache Key "${cacheKey}" populated after Call 1:`, cacheAfterCall1 !== null);
  if (cacheAfterCall1) {
    const parsedCache = JSON.parse(cacheAfterCall1);
    console.log(`Cached Plan Name: "${parsedCache.plan.name}", Code: "${parsedCache.plan.code}", Subscription ID: "${parsedCache.subscription.id}"`);
  }

  // Call 2: Should HIT Redis cache and execute ZERO DB queries
  console.log('\nExecuting Call 2 (Expecting Cache HIT -> 0 DB Queries)...');
  activeCall = 2;
  const res2 = await entitlementService.canUseFeature(orgIdForCache, 'org_insights');
  activeCall = 0;

  // Restore original findOne
  Subscription.findOne = originalFindOne;

  console.log(`Call 2 Result:`, res2);
  console.log(`DB Queries on Subscription.findOne during Call 2: ${dbQueriesCall2}`);
  console.log(`Cache HIT Verified: DB Queries Call 1 = ${dbQueriesCall1}, DB Queries Call 2 = ${dbQueriesCall2} (Zero DB queries on second call)`);

  if (dbQueriesCall1 < 1 || dbQueriesCall2 !== 0) {
    throw new Error(`Cache hit verification failed! Expected Call 1 >= 1 and Call 2 === 0, got Call 1=${dbQueriesCall1}, Call 2=${dbQueriesCall2}`);
  }

  // Cleanup test user, shop, organization
  console.log('\nCleaning up temporary test registration data...');
  await OrganizationMembership.destroy({ where: { organizationId: createdOrgId } });
  await User.destroy({ where: { id: createdUserId } });
  await Shop.destroy({ where: { id: createdShopId } });
  await Organization.destroy({ where: { id: createdOrgId } });
  await entitlementService.invalidateOrgEntitlements(createdOrgId);
  console.log('Cleanup completed successfully.');

  console.log('\n================================================================');
  console.log('ALL VERIFICATIONS (4, 5, 6) PASSED WITH FLYING COLORS');
  console.log('================================================================');
  process.exit(0);
}

runVerifications().catch(err => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
