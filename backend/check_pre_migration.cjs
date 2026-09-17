'use strict';
process.env.DB_NAME = 'zana_pos_test';
require('dotenv').config();
const sequelize = require('./src/config/database');

async function main() {
  await sequelize.authenticate();
  
  // Check Employee.id column type for FK compatibility
  const [empCols] = await sequelize.query(
    "SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Employees' AND COLUMN_NAME='id'"
  );
  console.log('Employee.id column:', JSON.stringify(empCols));
  
  // Check if migration partially ran
  const [catCols] = await sequelize.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Categories' AND COLUMN_NAME='organizationId'"
  );
  console.log('Categories.organizationId exists:', catCols.length > 0);

  const [dupes] = await sequelize.query(
    `SELECT s.organizationId, c.name, COUNT(*) as cnt, GROUP_CONCAT(c.id) as ids
     FROM Categories c JOIN Shops s ON s.id = c.shopId
     GROUP BY s.organizationId, c.name HAVING cnt > 1`
  );
  
  if (dupes.length > 0) {
    console.log('DUPLICATES FOUND:', JSON.stringify(dupes, null, 2));
    process.exit(1);
  }
  console.log('NO DUPLICATE category names per organization.');

  const [[cc]] = await sequelize.query('SELECT COUNT(*) as c FROM Categories');
  const [[sm]] = await sequelize.query('SELECT COUNT(*) as c FROM StockMovements');
  console.log('Categories:', cc.c, 'StockMovements:', sm.c);

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
