const { sequelize } = require('../src/models');

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connection successful.');

    console.log('\n--- DESCRIBE SaleRefunds ---');
    const [refundsCols] = await sequelize.query("DESCRIBE SaleRefunds");
    console.table(refundsCols);

    console.log('\n--- DESCRIBE SalePayments ---');
    const [paymentsCols] = await sequelize.query("DESCRIBE SalePayments");
    console.table(paymentsCols);

    console.log('\n--- SaleRefunds Foreign Keys ---');
    const [refundsFks] = await sequelize.query(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SaleRefunds' AND REFERENCED_TABLE_NAME IS NOT NULL;
    `);
    console.table(refundsFks);

    console.log('\n--- SalePayments Foreign Keys ---');
    const [paymentsFks] = await sequelize.query(`
      SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SalePayments' AND REFERENCED_TABLE_NAME IS NOT NULL;
    `);
    console.table(paymentsFks);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

run();
