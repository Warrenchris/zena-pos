const { sequelize } = require('./src/models');
const { QueryTypes } = require('sequelize');

async function main() {
  try {
    await sequelize.authenticate();
    console.log('DB connected successfully');

    // 1. Check sales for shopId = 4
    const salesGroup = await sequelize.query(`
      SELECT
          DATE(\`createdAt\`) AS \`date\`,
          SUM(\`total\`) AS \`revenue\`,
          COUNT(\`id\`) AS \`transaction_count\`,
          AVG(\`total\`) AS \`avg_transaction_value\`
      FROM \`Sales\` AS \`Sale\`
      WHERE
          \`Sale\`.\`shopId\` = 4
          AND \`Sale\`.\`saleStatus\` = 'completed'
          AND \`Sale\`.\`createdAt\` >= '2026-06-10 08:15:56'
      GROUP BY DATE(\`createdAt\`)
      ORDER BY DATE(\`createdAt\`) ASC;
    `, { type: QueryTypes.SELECT });

    console.log('Daily sales count:', salesGroup.length);
    console.log('Daily sales:', JSON.stringify(salesGroup, null, 2));

    // 2. Check individual transactions for the high revenue days
    // High days: 2026-07-09, 2026-07-31, 2026-08-02, 2026-08-31, 2026-09-08
    const highDays = ['2026-07-09', '2026-07-31', '2026-08-02', '2026-08-31', '2026-09-08'];
    for (const d of highDays) {
      const txs = await sequelize.query(`
        SELECT id, shopId, total, subtotal, tax, discount, paymentMethod, saleStatus, createdAt
        FROM \`Sales\`
        WHERE shopId = 4 AND DATE(\`createdAt\`) = :day
      `, { replacements: { day: d }, type: QueryTypes.SELECT });
      console.log(`\nTransactions for ${d} (count: ${txs.length}):`);
      console.log(JSON.stringify(txs, null, 2));
    }

    // Also check currency / shop settings for shopId 4
    const shops = await sequelize.query(`SELECT * FROM \`Shops\` WHERE id = 4`, { type: QueryTypes.SELECT });
    console.log('\nShop info:', JSON.stringify(shops, null, 2));

  } catch (err) {
    console.error('DB Error:', err);
  } finally {
    await sequelize.close();
  }
}

main();
