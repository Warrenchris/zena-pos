'use strict';

/**
 * Migration: Drop legacy global Sales invoice-number uniqueness constraint (SCHEM-01).
 *
 * Background:
 * An early migration created a single-column global unique constraint `Sales_invoiceNumber_unique`
 * on `Sales(invoiceNumber)`. In a multi-tenant SaaS, invoice numbers are generated per shop/tenant.
 * The intended business invariant is (shopId, invoiceNumber), which is already enforced by
 * `unique_sales_shop_invoice_number`.
 *
 * This migration safely drops the legacy global index while verifying that the scoped
 * index remains intact.
 */

async function getExistingIndexMap(queryInterface, tableName) {
  try {
    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    const map = new Map();
    for (const idx of indexes) {
      if (!map.has(idx.Key_name)) {
        map.set(idx.Key_name, { unique: idx.Non_unique === 0, columns: [] });
      }
      map.get(idx.Key_name).columns.push(idx.Column_name);
    }
    return map;
  } catch (err) {
    return new Map();
  }
}

async function dropIndexIfExists(queryInterface, tableName, indexName) {
  try {
    const existing = await getExistingIndexMap(queryInterface, tableName);
    if (existing.has(indexName)) {
      await queryInterface.sequelize.query(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
      console.log(`[Migration SCHEM-01] Successfully dropped legacy index '${indexName}' from '${tableName}'.`);
    }
  } catch (err) {
    if (!err.message.includes("Can't DROP") && !err.message.includes('check that column/key exists')) {
      console.warn(`[Migration Warning] Could not drop index ${indexName} from ${tableName}:`, err.message);
    }
  }
}

async function addUniqueIndexIfNotExists(queryInterface, tableName, columns, indexName) {
  const existing = await getExistingIndexMap(queryInterface, tableName);
  if (!existing.has(indexName)) {
    await queryInterface.addIndex(tableName, columns, {
      unique: true,
      name: indexName
    });
    console.log(`[Migration SCHEM-01] Added scoped unique index '${indexName}' to '${tableName}'.`);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Drop the legacy global unique index candidates on Sales.invoiceNumber
    const legacyIndexCandidates = [
      'Sales_invoiceNumber_unique',
      'sales_invoicenumber_unique',
      'invoiceNumber',
      'invoiceNumber_2'
    ];

    for (const idxName of legacyIndexCandidates) {
      await dropIndexIfExists(queryInterface, 'Sales', idxName);
    }

    // 2. Guarantee that the multi-tenant scoped unique index exists
    await addUniqueIndexIfNotExists(
      queryInterface,
      'Sales',
      ['shopId', 'invoiceNumber'],
      'unique_sales_shop_invoice_number'
    );
  },

  async down(queryInterface, Sequelize) {
    // Known limitation: Rollback will fail if multiple shops already have identical invoice numbers created while scoped uniqueness was active.
    // In rollback, recreate single-column index if needed
    const existing = await getExistingIndexMap(queryInterface, 'Sales');
    if (!existing.has('Sales_invoiceNumber_unique')) {
      await queryInterface.addIndex('Sales', ['invoiceNumber'], {
        unique: true,
        name: 'Sales_invoiceNumber_unique'
      });
    }
  }
};
