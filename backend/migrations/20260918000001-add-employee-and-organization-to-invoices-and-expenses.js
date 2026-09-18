'use strict';

/**
 * Migration: Add employeeId and organizationId to Invoices and Expenses (DATA-01).
 *
 * Resolves the identity fracture between integer User IDs and UUID Employee IDs
 * in financial models while establishing tenant-level organization scoping.
 */

async function getColumns(queryInterface, tableName) {
  try {
    const tableDesc = await queryInterface.describeTable(tableName);
    return Object.keys(tableDesc);
  } catch (err) {
    return [];
  }
}

async function getExistingIndexNames(queryInterface, tableName) {
  try {
    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    return new Set(indexes.map(idx => idx.Key_name));
  } catch (err) {
    return new Set();
  }
}

async function getExistingForeignKeys(queryInterface, tableName) {
  try {
    const [fks] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${tableName}'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `);
    return new Set(fks.map(f => f.CONSTRAINT_NAME));
  } catch (err) {
    return new Set();
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // -------------------------------------------------------------
    // 1. INVOICES TABLE
    // -------------------------------------------------------------
    const invoiceColumns = await getColumns(queryInterface, 'Invoices');

    if (!invoiceColumns.includes('employeeId')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Invoices\`
        ADD COLUMN \`employeeId\` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL
      `);
      console.log('[Migration DATA-01] Added column employeeId to Invoices.');
    }

    const invoiceFks = await getExistingForeignKeys(queryInterface, 'Invoices');
    if (!invoiceFks.has('fk_invoices_employeeId')) {
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE \`Invoices\`
          ADD CONSTRAINT \`fk_invoices_employeeId\`
          FOREIGN KEY (\`employeeId\`) REFERENCES \`Employees\` (\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
        `);
      } catch (fkErr) {
        console.warn('[Migration DATA-01] Warning adding fk_invoices_employeeId:', fkErr.message);
      }
    }

    if (!invoiceColumns.includes('organizationId')) {
      await queryInterface.addColumn('Invoices', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('[Migration DATA-01] Added column organizationId to Invoices.');
    }

    // Backfill Invoices.organizationId from Shops.organizationId
    await queryInterface.sequelize.query(`
      UPDATE Invoices i
      JOIN Shops s ON i.shopId = s.id
      SET i.organizationId = s.organizationId
      WHERE i.organizationId IS NULL AND s.organizationId IS NOT NULL
    `);

    const invoiceIndexes = await getExistingIndexNames(queryInterface, 'Invoices');
    if (!invoiceIndexes.has('idx_invoices_employee_id')) {
      await queryInterface.addIndex('Invoices', ['employeeId'], {
        name: 'idx_invoices_employee_id'
      });
    }
    if (!invoiceIndexes.has('idx_invoices_organization_id')) {
      await queryInterface.addIndex('Invoices', ['organizationId'], {
        name: 'idx_invoices_organization_id'
      });
    }

    // -------------------------------------------------------------
    // 2. EXPENSES TABLE
    // -------------------------------------------------------------
    const expenseColumns = await getColumns(queryInterface, 'Expenses');

    if (!expenseColumns.includes('employeeId')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Expenses\`
        ADD COLUMN \`employeeId\` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL
      `);
      console.log('[Migration DATA-01] Added column employeeId to Expenses.');
    }

    const expenseFks = await getExistingForeignKeys(queryInterface, 'Expenses');
    if (!expenseFks.has('fk_expenses_employeeId')) {
      try {
        await queryInterface.sequelize.query(`
          ALTER TABLE \`Expenses\`
          ADD CONSTRAINT \`fk_expenses_employeeId\`
          FOREIGN KEY (\`employeeId\`) REFERENCES \`Employees\` (\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
        `);
      } catch (fkErr) {
        console.warn('[Migration DATA-01] Warning adding fk_expenses_employeeId:', fkErr.message);
      }
    }

    if (!expenseColumns.includes('organizationId')) {
      await queryInterface.addColumn('Expenses', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('[Migration DATA-01] Added column organizationId to Expenses.');
    }

    // Backfill Expenses.organizationId from Shops.organizationId
    await queryInterface.sequelize.query(`
      UPDATE Expenses e
      JOIN Shops s ON e.shopId = s.id
      SET e.organizationId = s.organizationId
      WHERE e.organizationId IS NULL AND s.organizationId IS NOT NULL
    `);

    const expenseIndexes = await getExistingIndexNames(queryInterface, 'Expenses');
    if (!expenseIndexes.has('idx_expenses_employee_id')) {
      await queryInterface.addIndex('Expenses', ['employeeId'], {
        name: 'idx_expenses_employee_id'
      });
    }
    if (!expenseIndexes.has('idx_expenses_organization_id')) {
      await queryInterface.addIndex('Expenses', ['organizationId'], {
        name: 'idx_expenses_organization_id'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const invoiceCols = await getColumns(queryInterface, 'Invoices');
    if (invoiceCols.includes('organizationId')) {
      await queryInterface.removeColumn('Invoices', 'organizationId');
    }
    if (invoiceCols.includes('employeeId')) {
      await queryInterface.removeColumn('Invoices', 'employeeId');
    }

    const expenseCols = await getColumns(queryInterface, 'Expenses');
    if (expenseCols.includes('organizationId')) {
      await queryInterface.removeColumn('Expenses', 'organizationId');
    }
    if (expenseCols.includes('employeeId')) {
      await queryInterface.removeColumn('Expenses', 'employeeId');
    }
  }
};
