const { Sequelize } = require('sequelize');
const config = require('../src/config/sequelize');

const sequelize = new Sequelize(config.development);

async function updateInvoiceTable() {
  const transaction = await sequelize.transaction();
  
  try {
    // Get existing columns
    const [columns] = await sequelize.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'invoices'`
    );
    const existingColumns = columns.map(col => col.COLUMN_NAME.toLowerCase());

    // Define new columns
    const newColumns = {
      taxRate: "ADD COLUMN taxRate DECIMAL(5,2) DEFAULT 0",
      paymentAmount: "ADD COLUMN paymentAmount DECIMAL(10,2)",
      change: "ADD COLUMN `change` DECIMAL(10,2) DEFAULT 0",
      customerLocation: "ADD COLUMN customerLocation VARCHAR(255)",
      customerPhone: "ADD COLUMN customerPhone VARCHAR(255)",
      customerEmail: "ADD COLUMN customerEmail VARCHAR(255)",
      source: "ADD COLUMN source VARCHAR(255) DEFAULT 'pos'",
      fulfillmentStatus: "ADD COLUMN fulfillmentStatus VARCHAR(255) DEFAULT 'collected'",
      processedAt: "ADD COLUMN processedAt DATETIME",
      completedAt: "ADD COLUMN completedAt DATETIME",
      cancelledAt: "ADD COLUMN cancelledAt DATETIME",
      refundedAt: "ADD COLUMN refundedAt DATETIME"
    };

    // Add columns that don't exist
    for (const [columnName, addColumnSQL] of Object.entries(newColumns)) {
      if (!existingColumns.includes(columnName.toLowerCase())) {
        await sequelize.query(
          `ALTER TABLE invoices ${addColumnSQL}`,
          { transaction }
        );
      }
    }

    // Update status column if it exists
    if (existingColumns.includes('status')) {
      await sequelize.query(
        `ALTER TABLE invoices MODIFY COLUMN status VARCHAR(255) DEFAULT 'completed'`,
        { transaction }
      );
    }

    await transaction.commit();
    console.log('Successfully updated invoice table structure');
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating invoice table:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

updateInvoiceTable()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });