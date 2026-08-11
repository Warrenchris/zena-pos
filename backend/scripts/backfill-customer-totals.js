const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');

async function main() {
  const applyFlag = process.argv.includes('--apply');
  const logFilePath = path.join(__dirname, `customer_totals_backfill_${Date.now()}.log`);

  try {
    await sequelize.authenticate();

    const [rows] = await sequelize.query(`
      SELECT 
        c.id, 
        c.name, 
        CAST(c.totalPurchases AS DECIMAL(10,2)) AS storedTotalPurchases,
        CAST(COALESCE(s.grossSales, 0) AS DECIMAL(10,2)) AS actualNonCancelledSalesSum,
        CAST(COALESCE(r.totalRefunded, 0) AS DECIMAL(10,2)) AS totalRefunds,
        CAST((COALESCE(s.grossSales, 0) - COALESCE(r.totalRefunded, 0)) AS DECIMAL(10,2)) AS expectedNetPurchases
      FROM Customers c
      LEFT JOIN (
        SELECT customerId, SUM(total) AS grossSales
        FROM Sales
        WHERE saleStatus != 'cancelled' AND customerId IS NOT NULL
        GROUP BY customerId
      ) s ON c.id = s.customerId
      LEFT JOIN (
        SELECT s2.customerId, SUM(sr.amount) AS totalRefunded
        FROM SaleRefunds sr
        JOIN Sales s2 ON sr.saleId = s2.id
        WHERE sr.status = 'processed' AND s2.customerId IS NOT NULL
        GROUP BY s2.customerId
      ) r ON c.id = r.customerId
      ORDER BY c.id ASC
    `);

    const drifted = [];
    for (const row of rows) {
      const stored = parseFloat(row.storedTotalPurchases || 0);
      const expected = parseFloat(row.expectedNetPurchases || 0);
      const delta = expected - stored;
      
      if (Math.abs(delta) >= 0.01) {
        drifted.push({
          id: row.id,
          name: row.name,
          storedTotalPurchases: stored.toFixed(2),
          expectedNetPurchases: expected.toFixed(2),
          grossSales: parseFloat(row.actualNonCancelledSalesSum || 0).toFixed(2),
          refunds: parseFloat(row.totalRefunds || 0).toFixed(2),
          delta: delta.toFixed(2)
        });
      }
    }

    console.log(`\n======================================================`);
    console.log(`CUSTOMER TOTAL PURCHASES BACKFILL — ${applyFlag ? 'APPLY MODE' : 'DRY RUN'}`);
    console.log(`Total Customers Evaluated: ${rows.length}`);
    console.log(`Drifted Customers Found:   ${drifted.length}`);
    console.log(`======================================================\n`);

    if (drifted.length === 0) {
      console.log('🟢 No customer drift detected across the entire database!');
      await sequelize.close();
      return;
    }

    console.log(String('ID').padStart(6) + ' | ' + 
                String('Name').padEnd(24) + ' | ' + 
                String('Stored Total').padStart(14) + ' | ' + 
                String('Expected Net').padStart(14) + ' | ' + 
                String('Delta').padStart(12));
    console.log('-'.repeat(80));

    const logEntries = [];
    logEntries.push(`Execution Time: ${new Date().toISOString()}`);
    logEntries.push(`Mode: ${applyFlag ? 'APPLY' : 'DRY_RUN'}`);
    logEntries.push(`Evaluated: ${rows.length}, Drifted: ${drifted.length}\n`);

    for (const item of drifted) {
      const line = `${String(item.id).padStart(6)} | ${item.name.padEnd(24)} | ${item.storedTotalPurchases.padStart(14)} | ${item.expectedNetPurchases.padStart(14)} | ${item.delta.padStart(12)}`;
      console.log(line);
      logEntries.push(`Customer ID ${item.id} (${item.name}): stored=${item.storedTotalPurchases}, expected=${item.expectedNetPurchases}, delta=${item.delta}`);
    }

    if (!applyFlag) {
      console.log(`\n[DRY RUN SUMMARY] ${drifted.length} customer records need updating.`);
      console.log(`Run with '--apply' flag to commit these updates to the database.`);
      fs.writeFileSync(logFilePath, logEntries.join('\n'));
      console.log(`Log file written to: ${logFilePath}`);
    } else {
      console.log(`\nApplying updates within transaction...`);
      const t = await sequelize.transaction();
      try {
        for (const item of drifted) {
          await sequelize.query(
            `UPDATE Customers SET totalPurchases = :newTotal, updatedAt = NOW() WHERE id = :id`,
            {
              replacements: { newTotal: item.expectedNetPurchases, id: item.id },
              transaction: t
            }
          );
        }
        await t.commit();
        console.log(`✅ Successfully updated ${drifted.length} customer records in transaction!`);
        logEntries.push(`\nSTATUS: Applied successfully in transaction.`);
        fs.writeFileSync(logFilePath, logEntries.join('\n'));
        console.log(`Audit log file written to: ${logFilePath}`);
      } catch (updateErr) {
        await t.rollback();
        console.error(`🔴 Transaction rolled back due to error:`, updateErr.message);
        logEntries.push(`\nSTATUS: Rolled back due to error: ${updateErr.message}`);
        fs.writeFileSync(logFilePath, logEntries.join('\n'));
        process.exit(1);
      }
    }

    await sequelize.close();
  } catch (err) {
    console.error('Backfill script error:', err);
    process.exit(1);
  }
}

main();
