'use strict';

/**
 * Migration: Scope global unique indexes to per-shop composite unique indexes (FINDING-04).
 *
 * CRITICAL ARCHITECTURAL NOTE:
 * MySQL/InnoDB does NOT support transactional DDL. Any ALTER TABLE (such as DROP INDEX or ADD INDEX)
 * executes and commits immediately, ending any surrounding transaction.
 * Therefore, this migration is built to be idempotent and re-runnable:
 * 1. Checks current indexes dynamically via SHOW INDEX FROM <table>.
 * 2. Safely drops all numbered duplicate unique index aliases (e.g. sku_2..sku_11, email_2..email_11).
 * 3. Adds the composite unique index (shopId, <field>) only if not already present.
 *
 * EXCLUSION NOTE:
 * Users.email and Employees.email are intentionally EXCLUDED and remain globally unique,
 * because login resolution executes User.findOne({ where: { email } }) before shop context is known.
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
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // -------------------------------------------------------------
    // 1. PRODUCTS: Drop global unique indexes on sku & barcode; add composite
    // -------------------------------------------------------------
    const productSkuIndexes = [
      'sku', 'sku_2', 'sku_3', 'sku_4', 'sku_5',
      'sku_6', 'sku_7', 'sku_8', 'sku_9', 'sku_10', 'sku_11'
    ];
    for (const idx of productSkuIndexes) {
      await dropIndexIfExists(queryInterface, 'Products', idx);
    }

    const productBarcodeIndexes = [
      'barcode', 'barcode_2', 'barcode_3', 'barcode_4', 'barcode_5',
      'barcode_6', 'barcode_7', 'barcode_8', 'barcode_9', 'barcode_10', 'barcode_11'
    ];
    for (const idx of productBarcodeIndexes) {
      await dropIndexIfExists(queryInterface, 'Products', idx);
    }

    await addUniqueIndexIfNotExists(queryInterface, 'Products', ['shopId', 'sku'], 'unique_products_shop_sku');
    await addUniqueIndexIfNotExists(queryInterface, 'Products', ['shopId', 'barcode'], 'unique_products_shop_barcode');

    // -------------------------------------------------------------
    // 2. CATEGORIES: Drop global unique index on name; add composite
    // -------------------------------------------------------------
    const categoryNameIndexes = [
      'name', 'name_2', 'name_3', 'name_4', 'name_5',
      'name_6', 'name_7', 'name_8', 'name_9', 'name_10', 'name_11'
    ];
    for (const idx of categoryNameIndexes) {
      await dropIndexIfExists(queryInterface, 'Categories', idx);
    }

    await addUniqueIndexIfNotExists(queryInterface, 'Categories', ['shopId', 'name'], 'unique_categories_shop_name');

    // -------------------------------------------------------------
    // 3. COUPONS: Drop global unique index on code; add composite
    // -------------------------------------------------------------
    await dropIndexIfExists(queryInterface, 'Coupons', 'code');
    await addUniqueIndexIfNotExists(queryInterface, 'Coupons', ['shopId', 'code'], 'unique_coupons_shop_code');

    // -------------------------------------------------------------
    // 4. CUSTOMERS: Drop global unique index on email; add composite
    // -------------------------------------------------------------
    const customerEmailIndexes = [
      'email', 'email_2', 'email_3', 'email_4', 'email_5',
      'email_6', 'email_7', 'email_8', 'email_9', 'email_10', 'email_11'
    ];
    for (const idx of customerEmailIndexes) {
      await dropIndexIfExists(queryInterface, 'Customers', idx);
    }

    await addUniqueIndexIfNotExists(queryInterface, 'Customers', ['shopId', 'email'], 'unique_customers_shop_email');

    // -------------------------------------------------------------
    // 5. SALES: Drop global unique indexes on invoiceNumber & idempotencyKey; add composite
    // -------------------------------------------------------------
    const salesInvoiceIndexes = [
      'invoiceNumber', 'invoiceNumber_2', 'invoiceNumber_3', 'invoiceNumber_4', 'invoiceNumber_5',
      'invoiceNumber_6', 'invoiceNumber_7', 'invoiceNumber_8', 'invoiceNumber_9'
    ];
    for (const idx of salesInvoiceIndexes) {
      await dropIndexIfExists(queryInterface, 'Sales', idx);
    }

    await dropIndexIfExists(queryInterface, 'Sales', 'sales_idempotency_key_unique');

    await addUniqueIndexIfNotExists(queryInterface, 'Sales', ['shopId', 'invoiceNumber'], 'unique_sales_shop_invoice_number');
    await addUniqueIndexIfNotExists(queryInterface, 'Sales', ['shopId', 'idempotencyKey'], 'unique_sales_shop_idempotency_key');

    // -------------------------------------------------------------
    // 6. INVOICES: Drop global unique index on invoiceNumber; add composite
    // -------------------------------------------------------------
    const invoiceNumberIndexes = [
      'invoiceNumber', 'invoiceNumber_2', 'invoiceNumber_3', 'invoiceNumber_4', 'invoiceNumber_5',
      'invoiceNumber_6', 'invoiceNumber_7', 'invoiceNumber_8', 'invoiceNumber_9', 'invoiceNumber_10'
    ];
    for (const idx of invoiceNumberIndexes) {
      await dropIndexIfExists(queryInterface, 'Invoices', idx);
    }

    await addUniqueIndexIfNotExists(queryInterface, 'Invoices', ['shopId', 'invoiceNumber'], 'unique_invoices_shop_invoice_number');
  },

  async down(queryInterface, Sequelize) {
    /**
     * KNOWN LIMITATION:
     * Rollback will FAIL with a unique constraint error if multiple shops have created records
     * sharing identical values (e.g. two shops having SKU-0001 or invoice 20260912-0001) while
     * this migration was active. This is expected behavior for multi-tenant index restructuring.
     */

    // 1. Revert Invoices
    await dropIndexIfExists(queryInterface, 'Invoices', 'unique_invoices_shop_invoice_number');
    await addUniqueIndexIfNotExists(queryInterface, 'Invoices', ['invoiceNumber'], 'invoiceNumber');

    // 2. Revert Sales
    await dropIndexIfExists(queryInterface, 'Sales', 'unique_sales_shop_invoice_number');
    await dropIndexIfExists(queryInterface, 'Sales', 'unique_sales_shop_idempotency_key');
    await addUniqueIndexIfNotExists(queryInterface, 'Sales', ['invoiceNumber'], 'invoiceNumber');
    await addUniqueIndexIfNotExists(queryInterface, 'Sales', ['idempotencyKey'], 'sales_idempotency_key_unique');

    // 3. Revert Customers
    await dropIndexIfExists(queryInterface, 'Customers', 'unique_customers_shop_email');
    await addUniqueIndexIfNotExists(queryInterface, 'Customers', ['email'], 'email');

    // 4. Revert Coupons
    await dropIndexIfExists(queryInterface, 'Coupons', 'unique_coupons_shop_code');
    await addUniqueIndexIfNotExists(queryInterface, 'Coupons', ['code'], 'code');

    // 5. Revert Categories
    await dropIndexIfExists(queryInterface, 'Categories', 'unique_categories_shop_name');
    await addUniqueIndexIfNotExists(queryInterface, 'Categories', ['name'], 'name');

    // 6. Revert Products
    await dropIndexIfExists(queryInterface, 'Products', 'unique_products_shop_sku');
    await dropIndexIfExists(queryInterface, 'Products', 'unique_products_shop_barcode');
    await addUniqueIndexIfNotExists(queryInterface, 'Products', ['sku'], 'sku');
    await addUniqueIndexIfNotExists(queryInterface, 'Products', ['barcode'], 'barcode');
  }
};
