'use strict';
process.env.DB_NAME = 'zana_pos_test';
require('dotenv').config();
const sequelize = require('./src/config/database');

async function main() {
  await sequelize.authenticate();
  
  // Check Employee.id charset
  const [empCols] = await sequelize.query(
    `SELECT COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Employees' AND COLUMN_NAME='id'`
  );
  console.log('Employee.id:', JSON.stringify(empCols));

  // Categories indexes
  const [catIdx] = await sequelize.query(
    `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME 
     FROM INFORMATION_SCHEMA.STATISTICS 
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Categories'
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`
  );
  console.log('Categories indexes:');
  catIdx.forEach(r => console.log(`  ${r.INDEX_NAME} (${r.COLUMN_NAME}) unique=${!r.NON_UNIQUE}`));

  // Categories.organizationId details
  const [orgCol] = await sequelize.query(
    `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE 
     FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='Categories' AND COLUMN_NAME='organizationId'`
  );
  console.log('Categories.organizationId:', JSON.stringify(orgCol));

  // StockMovements columns
  const [smCols] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='StockMovements' 
     AND COLUMN_NAME IN ('employeeId', 'organizationId')`
  );
  console.log('StockMovements extra columns:', JSON.stringify(smCols));

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
