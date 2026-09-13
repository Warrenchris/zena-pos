const sequelize = require('../src/config/database');

async function checkPrimaryCollisions() {
  console.log('Checking collisions on database:', sequelize.config.database);

  const [cols] = await sequelize.query("SHOW COLUMNS FROM Products LIKE 'organizationId'");
  const hasOrgCol = cols.length > 0;

  const skuQuery = hasOrgCol 
    ? `SELECT organizationId, sku, COUNT(*) AS collisionCount, GROUP_CONCAT(id) AS productIds, GROUP_CONCAT(shopId) AS shopIds
       FROM Products
       WHERE sku IS NOT NULL AND sku != ''
       GROUP BY organizationId, sku
       HAVING COUNT(*) > 1`
    : `SELECT s.organizationId, p.sku, COUNT(*) AS collisionCount, GROUP_CONCAT(p.id) AS productIds, GROUP_CONCAT(p.shopId) AS shopIds
       FROM Products p
       JOIN Shops s ON s.id = p.shopId
       WHERE p.sku IS NOT NULL AND p.sku != ''
       GROUP BY s.organizationId, p.sku
       HAVING COUNT(*) > 1`;

  const barcodeQuery = hasOrgCol
    ? `SELECT organizationId, barcode, COUNT(*) AS collisionCount, GROUP_CONCAT(id) AS productIds, GROUP_CONCAT(shopId) AS shopIds
       FROM Products
       WHERE barcode IS NOT NULL AND barcode != ''
       GROUP BY organizationId, barcode
       HAVING COUNT(*) > 1`
    : `SELECT s.organizationId, p.barcode, COUNT(*) AS collisionCount, GROUP_CONCAT(p.id) AS productIds, GROUP_CONCAT(p.shopId) AS shopIds
       FROM Products p
       JOIN Shops s ON s.id = p.shopId
       WHERE p.barcode IS NOT NULL AND p.barcode != ''
       GROUP BY s.organizationId, p.barcode
       HAVING COUNT(*) > 1`;

  const [skuCollisions] = await sequelize.query(skuQuery);
  const [barcodeCollisions] = await sequelize.query(barcodeQuery);

  console.log('SKU Collisions count:', skuCollisions.length);
  if (skuCollisions.length > 0) console.log('SKU Collisions:', JSON.stringify(skuCollisions, null, 2));
  console.log('Barcode Collisions count:', barcodeCollisions.length);
  if (barcodeCollisions.length > 0) console.log('Barcode Collisions:', JSON.stringify(barcodeCollisions, null, 2));

  const [productCount] = await sequelize.query('SELECT COUNT(*) as total FROM Products');
  console.log('Total Products in primary:', productCount[0].total);

  await sequelize.close();
}

checkPrimaryCollisions().catch(err => {
  console.error(err);
  process.exit(1);
});
