const sequelize = require('../src/config/database');

async function inspect() {
  console.log('Inspecting Database:', sequelize.config.database);

  const [pCols] = await sequelize.query('DESCRIBE Products');
  console.log('Products columns:');
  console.table(pCols.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));

  const [iCols] = await sequelize.query('DESCRIBE Inventory');
  console.log('Inventory columns:');
  console.table(iCols.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));

  const [pIdx] = await sequelize.query('SHOW INDEX FROM Products');
  console.log('Products indexes:');
  console.table(pIdx.map(i => ({ Key_name: i.Key_name, Column_name: i.Column_name, Non_unique: i.Non_unique })));

  const [iIdx] = await sequelize.query('SHOW INDEX FROM Inventory');
  console.log('Inventory indexes:');
  console.table(iIdx.map(i => ({ Key_name: i.Key_name, Column_name: i.Column_name, Non_unique: i.Non_unique })));

  const [fks] = await sequelize.query(`
    SELECT 
      rc.CONSTRAINT_NAME, 
      kcu.TABLE_NAME, 
      kcu.COLUMN_NAME, 
      kcu.REFERENCED_TABLE_NAME, 
      kcu.REFERENCED_COLUMN_NAME,
      rc.DELETE_RULE,
      rc.UPDATE_RULE
    FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
      ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
      AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
    WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
      AND kcu.TABLE_NAME IN ('Products', 'Inventory')
  `);
  console.log('Foreign Key Constraints & Actions:');
  console.table(fks);

  const [invCount] = await sequelize.query('SELECT COUNT(*) as total FROM Inventory');
  const [prodCount] = await sequelize.query('SELECT COUNT(*) as total FROM Products');
  console.log('Backfill verification - Products count:', prodCount[0].total, 'Inventory count:', invCount[0].total);

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
