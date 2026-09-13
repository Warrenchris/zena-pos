const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function runCollisionAudit() {
  await sequelize.authenticate();
  console.log('=== COLLISION AUDIT: PRIMARY DATABASE (' + sequelize.config.database + ') ===\n');

  // 1. CUSTOMERS AUDIT
  const [[{ totalCustomers }]] = await sequelize.query('SELECT COUNT(*) AS totalCustomers FROM Customers');
  const [[{ distinctEmails }]] = await sequelize.query("SELECT COUNT(DISTINCT email) AS distinctEmails FROM Customers WHERE email IS NOT NULL AND email != ''");
  const [[{ nullEmails }]] = await sequelize.query("SELECT COUNT(*) AS nullEmails FROM Customers WHERE email IS NULL OR email = ''");

  console.log('--- 1. CUSTOMERS AUDIT ---');
  console.log('Total Customer records:', totalCustomers);
  console.log('Distinct non-empty emails:', distinctEmails);
  console.log('Null or empty emails:', nullEmails);

  // Breakdown by Shop and Org
  const [customerShopBreakdown] = await sequelize.query(`
    SELECT 
      s.id AS shopId,
      s.name AS shopName,
      s.organizationId,
      o.name AS organizationName,
      COUNT(c.id) AS customerCount,
      COUNT(DISTINCT c.email) AS distinctEmailCount
    FROM Shops s
    JOIN Organizations o ON o.id = s.organizationId
    LEFT JOIN Customers c ON c.shopId = s.id
    GROUP BY s.id, s.name, s.organizationId, o.name
    ORDER BY s.id ASC
  `);
  console.log('\nCustomer Distribution Across Shops & Organizations:');
  console.table(customerShopBreakdown);

  // Intra-organization email collisions (same organizationId, duplicate email across different shops or same shop)
  const [intraOrgCustomerCollisions] = await sequelize.query(`
    SELECT 
      c.email,
      s.organizationId,
      o.name AS organizationName,
      COUNT(DISTINCT c.shopId) AS distinctShops,
      COUNT(*) AS duplicateCount,
      GROUP_CONCAT(c.id) AS customerIds,
      GROUP_CONCAT(c.shopId) AS shopIds
    FROM Customers c
    JOIN Shops s ON s.id = c.shopId
    JOIN Organizations o ON o.id = s.organizationId
    WHERE c.email IS NOT NULL AND c.email != ''
    GROUP BY c.email, s.organizationId, o.name
    HAVING COUNT(*) > 1
  `);
  console.log('Intra-Org Customer Email Collisions (same org, duplicate email):', intraOrgCustomerCollisions.length);
  if (intraOrgCustomerCollisions.length > 0) {
    console.table(intraOrgCustomerCollisions);
  } else {
    console.log('>> ZERO intra-organization customer email collisions found.');
  }

  // Cross-organization shared emails (valid under org scoping - e.g. customer shops at unrelated orgs)
  const [crossOrgCustomerEmails] = await sequelize.query(`
    SELECT 
      c.email,
      COUNT(DISTINCT s.organizationId) AS distinctOrgs,
      COUNT(*) AS totalOccurrences,
      GROUP_CONCAT(DISTINCT s.organizationId) AS orgIds
    FROM Customers c
    JOIN Shops s ON s.id = c.shopId
    WHERE c.email IS NOT NULL AND c.email != ''
    GROUP BY c.email
    HAVING COUNT(DISTINCT s.organizationId) > 1
  `);
  console.log('Cross-Org Customer Shared Emails (different orgs, same email):', crossOrgCustomerEmails.length);
  if (crossOrgCustomerEmails.length > 0) {
    console.table(crossOrgCustomerEmails);
  } else {
    console.log('>> ZERO cross-organization customer email sharing currently in DB.');
  }

  // Customer phone number audit (for reference)
  const [[{ distinctPhones }]] = await sequelize.query("SELECT COUNT(DISTINCT phone) AS distinctPhones FROM Customers WHERE phone IS NOT NULL AND phone != ''");
  console.log('Distinct non-empty phones:', distinctPhones);

  const [intraOrgPhoneCollisions] = await sequelize.query(`
    SELECT 
      c.phone,
      s.organizationId,
      COUNT(*) AS duplicateCount,
      GROUP_CONCAT(c.id) AS customerIds
    FROM Customers c
    JOIN Shops s ON s.id = c.shopId
    WHERE c.phone IS NOT NULL AND c.phone != ''
    GROUP BY c.phone, s.organizationId
    HAVING COUNT(*) > 1
  `);
  console.log('Intra-Org Customer Phone Collisions:', intraOrgPhoneCollisions.length);
  if (intraOrgPhoneCollisions.length > 0) {
    console.table(intraOrgPhoneCollisions);
  }

  // 2. SUPPLIERS AUDIT
  console.log('\n--- 2. SUPPLIERS AUDIT ---');
  const [[{ totalSuppliers }]] = await sequelize.query('SELECT COUNT(*) AS totalSuppliers FROM Suppliers');
  const [[{ distinctSupplierNames }]] = await sequelize.query("SELECT COUNT(DISTINCT name) AS distinctSupplierNames FROM Suppliers WHERE name IS NOT NULL AND name != ''");
  const [[{ distinctSupplierEmails }]] = await sequelize.query("SELECT COUNT(DISTINCT email) AS distinctSupplierEmails FROM Suppliers WHERE email IS NOT NULL AND email != ''");
  const [[{ distinctSupplierPhones }]] = await sequelize.query("SELECT COUNT(DISTINCT phone) AS distinctSupplierPhones FROM Suppliers WHERE phone IS NOT NULL AND phone != ''");

  console.log('Total Supplier records:', totalSuppliers);
  console.log('Distinct non-empty names:', distinctSupplierNames);
  console.log('Distinct non-empty emails:', distinctSupplierEmails);
  console.log('Distinct non-empty phones:', distinctSupplierPhones);

  const [supplierShopBreakdown] = await sequelize.query(`
    SELECT 
      s.id AS shopId,
      s.name AS shopName,
      s.organizationId,
      o.name AS organizationName,
      COUNT(sup.id) AS supplierCount,
      COUNT(DISTINCT sup.name) AS distinctNameCount
    FROM Shops s
    JOIN Organizations o ON o.id = s.organizationId
    LEFT JOIN Suppliers sup ON sup.shopId = s.id
    GROUP BY s.id, s.name, s.organizationId, o.name
    ORDER BY s.id ASC
  `);
  console.log('\nSupplier Distribution Across Shops & Organizations:');
  console.table(supplierShopBreakdown);

  // Intra-org supplier name collisions
  const [intraOrgSupplierNameCollisions] = await sequelize.query(`
    SELECT 
      sup.name AS supplierName,
      s.organizationId,
      o.name AS organizationName,
      COUNT(DISTINCT sup.shopId) AS distinctShops,
      COUNT(*) AS duplicateCount,
      GROUP_CONCAT(sup.id) AS supplierIds,
      GROUP_CONCAT(sup.shopId) AS shopIds
    FROM Suppliers sup
    JOIN Shops s ON s.id = sup.shopId
    JOIN Organizations o ON o.id = s.organizationId
    WHERE sup.name IS NOT NULL AND sup.name != ''
    GROUP BY sup.name, s.organizationId, o.name
    HAVING COUNT(*) > 1
  `);
  console.log('Intra-Org Supplier Name Collisions:', intraOrgSupplierNameCollisions.length);
  if (intraOrgSupplierNameCollisions.length > 0) {
    console.table(intraOrgSupplierNameCollisions);
  } else {
    console.log('>> ZERO intra-organization supplier name collisions found.');
  }

  // Intra-org supplier email collisions
  const [intraOrgSupplierEmailCollisions] = await sequelize.query(`
    SELECT 
      sup.email AS supplierEmail,
      s.organizationId,
      o.name AS organizationName,
      COUNT(*) AS duplicateCount,
      GROUP_CONCAT(sup.id) AS supplierIds
    FROM Suppliers sup
    JOIN Shops s ON s.id = sup.shopId
    JOIN Organizations o ON o.id = s.organizationId
    WHERE sup.email IS NOT NULL AND sup.email != ''
    GROUP BY sup.email, s.organizationId, o.name
    HAVING COUNT(*) > 1
  `);
  console.log('Intra-Org Supplier Email Collisions:', intraOrgSupplierEmailCollisions.length);
  if (intraOrgSupplierEmailCollisions.length > 0) {
    console.table(intraOrgSupplierEmailCollisions);
  } else {
    console.log('>> ZERO intra-organization supplier email collisions found.');
  }

  await sequelize.close();
  process.exit(0);
}

runCollisionAudit().catch(err => {
  console.error('Audit failure:', err);
  process.exit(1);
});
