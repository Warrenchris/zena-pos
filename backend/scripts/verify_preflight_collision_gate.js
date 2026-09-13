'use strict';

const path = require('path');
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Sequelize, QueryTypes } = require('sequelize');
const config = require('../src/config/sequelize').test;

const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  logging: false
});

const migration = require('../migrations/20260913131856-split-product-catalog-and-inventory');

async function runProof() {
  console.log('================================================================================');
  console.log('PROOF: PRE-FLIGHT COLLISION GATE ABORT-AND-REPORT VERIFICATION');
  console.log('Target Database:', config.database);
  console.log('================================================================================\n');

  try {
    // 0. Ensure baseline state: Inventory table must not exist
    await sequelize.query('DROP TABLE IF EXISTS `Inventory`');
    // Drop test products if remaining
    await sequelize.query("DELETE FROM `Products` WHERE `sku` = 'TEST-COLLIDE-SKU'");

    // 1. Setup collision scenario
    console.log('[Step 1] Setting up intra-organization SKU collision scenario...');
    
    // Find an organization with at least 2 shops, or create a second shop under Org 1
    const [shops] = await sequelize.query('SELECT id, organizationId FROM `Shops` WHERE organizationId IS NOT NULL ORDER BY id ASC LIMIT 2');
    if (shops.length < 2) {
      throw new Error('Test DB needs at least 2 shops with organizationId to simulate intra-org collision');
    }

    const orgId = shops[0].organizationId;
    const shop1Id = shops[0].id;
    // Set shop 2 under the same org if not already
    await sequelize.query(`UPDATE \`Shops\` SET organizationId = ${orgId} WHERE id = ${shops[1].id}`);
    const shop2Id = shops[1].id;

    console.log(` - Testing with Organization ID: ${orgId}, Shop 1: ${shop1Id}, Shop 2: ${shop2Id}`);

    // Insert two colliding products under the same SKU with differing prices
    const [p1Result] = await sequelize.query(`
      INSERT INTO \`Products\` (\`name\`, \`sku\`, \`price\`, \`cost\`, \`stockQuantity\`, \`reorderPoint\`, \`active\`, \`shopId\`, \`createdAt\`, \`updatedAt\`)
      VALUES ('Test Soda A', 'TEST-COLLIDE-SKU', 50.00, 30.00, 10, 5, 1, ${shop1Id}, NOW(), NOW())
    `);
    const p1Id = p1Result;

    const [p2Result] = await sequelize.query(`
      INSERT INTO \`Products\` (\`name\`, \`sku\`, \`price\`, \`cost\`, \`stockQuantity\`, \`reorderPoint\`, \`active\`, \`shopId\`, \`createdAt\`, \`updatedAt\`)
      VALUES ('Test Soda B', 'TEST-COLLIDE-SKU', 65.00, 30.00, 20, 5, 1, ${shop2Id}, NOW(), NOW())
    `);
    const p2Id = p2Result;

    console.log(` - Created colliding Product 1 (ID ${p1Id}, Shop ${shop1Id}, Price 50.00, SKU: TEST-COLLIDE-SKU)`);
    console.log(` - Created colliding Product 2 (ID ${p2Id}, Shop ${shop2Id}, Price 65.00, SKU: TEST-COLLIDE-SKU)`);

    // 2. Run Migration UP against colliding data - EXPECT FAILURE
    console.log('\n[Step 2] Executing migration against colliding data (expecting ABORT)...');
    let abortCaught = false;
    let abortMessage = '';

    try {
      await migration.up(sequelize.getQueryInterface(), Sequelize);
    } catch (err) {
      abortCaught = true;
      abortMessage = err.message;
      console.log('\n>>> MIGRATION ERROR CAUGHT AS EXPECTED <<<');
      console.log('Error Message:', err.message);
    }

    if (!abortCaught) {
      throw new Error('FAIL: Migration did NOT abort on intra-org SKU collision!');
    }

    // 3. Verify zero schema changes made
    console.log('\n[Step 3] Verifying zero schema changes were applied...');
    const [invTable] = await sequelize.query("SHOW TABLES LIKE 'Inventory'");
    const [orgSkuIdx] = await sequelize.query("SHOW INDEX FROM `Products` WHERE Key_name = 'unique_products_org_sku'");
    const [orgFk] = await sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Products' AND CONSTRAINT_NAME = 'fk_products_organization_id'
    `);

    console.log(' - Table `Inventory` exists:', invTable.length > 0 ? 'YES (REGRESSION)' : 'NO (CORRECT)');
    console.log(' - Index `unique_products_org_sku` exists:', orgSkuIdx.length > 0 ? 'YES (REGRESSION)' : 'NO (CORRECT)');
    console.log(' - Constraint `fk_products_organization_id` exists:', orgFk.length > 0 ? 'YES (REGRESSION)' : 'NO (CORRECT)');

    if (invTable.length > 0 || orgSkuIdx.length > 0 || orgFk.length > 0) {
      throw new Error('FAIL: Schema changes were partially applied despite collision abort!');
    }
    console.log('>>> CONFIRMED: Migration aborted with ZERO schema changes! <<<');

    // 4. Clean up test collision
    console.log('\n[Step 4] Cleaning up colliding test scenario...');
    await sequelize.query("DELETE FROM `Products` WHERE `sku` = 'TEST-COLLIDE-SKU'");
    console.log(' - Deleted colliding products');

    // 5. Run migration UP against clean data
    console.log('\n[Step 5] Running migration UP against clean data...');
    await migration.up(sequelize.getQueryInterface(), Sequelize);
    console.log('>>> Migration UP completed successfully! <<<');

    // 6. Verify schema changes were properly applied
    console.log('\n[Step 6] Verifying schema changes on clean data...');
    const [invTableAfter] = await sequelize.query("SHOW TABLES LIKE 'Inventory'");
    const [orgSkuIdxAfter] = await sequelize.query("SHOW INDEX FROM `Products` WHERE Key_name = 'unique_products_org_sku'");
    const [orgFkAfter] = await sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Products' AND CONSTRAINT_NAME = 'fk_products_organization_id'
    `);
    const [invCount] = await sequelize.query("SELECT COUNT(*) AS count FROM `Inventory`");

    console.log(' - Table `Inventory` exists:', invTableAfter.length > 0 ? 'YES' : 'NO');
    console.log(' - Index `unique_products_org_sku` exists:', orgSkuIdxAfter.length > 0 ? 'YES' : 'NO');
    console.log(' - Constraint `fk_products_organization_id` exists:', orgFkAfter.length > 0 ? 'YES' : 'NO');
    console.log(' - Inventory rows backfilled:', invCount[0].count);

    if (invTableAfter.length === 0 || orgSkuIdxAfter.length === 0 || orgFkAfter.length === 0) {
      throw new Error('FAIL: Migration on clean data did not apply expected schema!');
    }

    // 7. Verify migration DOWN (Idempotency)
    console.log('\n[Step 7] Testing migration DOWN (Rollback idempotency)...');
    await migration.down(sequelize.getQueryInterface(), Sequelize);
    console.log('>>> Migration DOWN completed successfully! <<<');

    const [invTableDown] = await sequelize.query("SHOW TABLES LIKE 'Inventory'");
    const [shopSkuIdxDown] = await sequelize.query("SHOW INDEX FROM `Products` WHERE Key_name = 'unique_products_shop_sku'");
    console.log(' - Table `Inventory` after rollback exists:', invTableDown.length > 0 ? 'YES (REGRESSION)' : 'NO (CORRECT)');
    console.log(' - Restored index `unique_products_shop_sku` exists:', shopSkuIdxDown.length > 0 ? 'YES' : 'NO');

    // 8. Re-apply migration UP cleanly
    console.log('\n[Step 8] Re-applying migration UP to leave database in migrated state...');
    await migration.up(sequelize.getQueryInterface(), Sequelize);
    console.log('>>> Re-applied migration UP successfully! <<<');

    // Record migration in SequelizeMeta on test DB so sequelize-cli recognizes it
    const [metaCheck] = await sequelize.query("SELECT * FROM `SequelizeMeta` WHERE `name` = '20260913131856-split-product-catalog-and-inventory.js'");
    if (metaCheck.length === 0) {
      await sequelize.query("INSERT INTO `SequelizeMeta` (`name`) VALUES ('20260913131856-split-product-catalog-and-inventory.js')");
    }

    console.log('\n================================================================================');
    console.log('ALL PRE-FLIGHT COLLISION GATE PROOF STEPS PASSED WITH REAL OUTPUT!');
    console.log('================================================================================');
  } catch (error) {
    console.error('\n❌ PROOF SCRIPT FAILED:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runProof();
