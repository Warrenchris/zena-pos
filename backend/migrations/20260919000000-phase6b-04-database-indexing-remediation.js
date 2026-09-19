'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Helper to safely add an index if it doesn't already exist
    const safeAddIndex = async (tableName, columns, options) => {
      try {
        await queryInterface.addIndex(tableName, columns, options);
      } catch (err) {
        if (err.message && (err.message.includes('Duplicate key name') || err.message.includes('already exists'))) {
          console.log(`[Migration Notice] Index ${options.name} on ${tableName} already exists, skipping.`);
        } else {
          throw err;
        }
      }
    };

    // Helper to safely remove an index if it exists
    const safeRemoveIndex = async (tableName, indexName) => {
      try {
        await queryInterface.removeIndex(tableName, indexName);
      } catch (err) {
        if (err.message && (err.message.includes("Can't DROP") || err.message.includes("check that column/key exists") || err.message.includes("does not exist"))) {
          console.log(`[Migration Notice] Index ${indexName} on ${tableName} does not exist, skipping drop.`);
        } else {
          throw err;
        }
      }
    };

    // 1. INDX-01-A: Employees composite index (shopId, createdAt)
    await safeAddIndex('Employees', ['shopId', 'createdAt'], {
      name: 'idx_employees_shop_createdAt',
      using: 'BTREE'
    });

    // 2. INDX-01-B: SaleRefunds composite index (shopId, createdAt)
    await safeAddIndex('SaleRefunds', ['shopId', 'createdAt'], {
      name: 'idx_sale_refunds_shop_createdAt',
      using: 'BTREE'
    });

    // 3. INDX-02: Invoices composite index (shopId, createdAt)
    await safeAddIndex('Invoices', ['shopId', 'createdAt'], {
      name: 'idx_invoices_shop_createdAt',
      using: 'BTREE'
    });

    // 4. INDX-03: SaleRefunds product index (productId)
    await safeAddIndex('SaleRefunds', ['productId'], {
      name: 'idx_sale_refunds_product_id',
      using: 'BTREE'
    });

    // 5. INDX-04: StockMovements composite index (organizationId, createdAt)
    await safeAddIndex('StockMovements', ['organizationId', 'createdAt'], {
      name: 'idx_stockmovements_org_createdAt',
      using: 'BTREE'
    });

    // 6. DUP-01: Remove duplicate indexes on SaleItems (retain idx_sale_items_product_id & idx_sale_items_sale_id)
    await safeRemoveIndex('SaleItems', 'idx_saleItems_productId');
    await safeRemoveIndex('SaleItems', 'idx_saleItems_saleId');

    // 7. DUP-02: Remove duplicate index on Invoices (retain idx_invoices_employee_id)
    await safeRemoveIndex('Invoices', 'invoices_employee_id');

    // 8. DUP-03: Remove redundant non-unique index on PendingPayments (retain UNIQUE checkoutRequestId)
    await safeRemoveIndex('PendingPayments', 'pending_payments_checkout_request_id');

    // 9. DUP-04: Remove redundant single-column index on Products (retain idx_products_shop_id)
    await safeRemoveIndex('Products', 'idx_products_shop_stockQuantity');
  },

  async down(queryInterface, Sequelize) {
    // Helper to safely remove index
    const safeRemoveIndex = async (tableName, indexName) => {
      try {
        await queryInterface.removeIndex(tableName, indexName);
      } catch (err) {
        console.log(`[Rollback Notice] Could not drop ${indexName} on ${tableName}:`, err.message);
      }
    };

    // Helper to safely add index
    const safeAddIndex = async (tableName, columns, options) => {
      try {
        await queryInterface.addIndex(tableName, columns, options);
      } catch (err) {
        console.log(`[Rollback Notice] Could not recreate ${options.name} on ${tableName}:`, err.message);
      }
    };

    // 1. Remove new composite indexes
    await safeRemoveIndex('Employees', 'idx_employees_shop_createdAt');
    await safeRemoveIndex('SaleRefunds', 'idx_sale_refunds_shop_createdAt');
    await safeRemoveIndex('Invoices', 'idx_invoices_shop_createdAt');
    await safeRemoveIndex('SaleRefunds', 'idx_sale_refunds_product_id');
    await safeRemoveIndex('StockMovements', 'idx_stockmovements_org_createdAt');

    // 2. Recreate duplicate indexes if rolled back
    await safeAddIndex('SaleItems', ['productId'], { name: 'idx_saleItems_productId' });
    await safeAddIndex('SaleItems', ['saleId'], { name: 'idx_saleItems_saleId' });
    await safeAddIndex('Invoices', ['employeeId'], { name: 'invoices_employee_id' });
    await safeAddIndex('PendingPayments', ['checkoutRequestId'], { name: 'pending_payments_checkout_request_id' });
    await safeAddIndex('Products', ['shopId'], { name: 'idx_products_shop_stockQuantity' });
  }
};
