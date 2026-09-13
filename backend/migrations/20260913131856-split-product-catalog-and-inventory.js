'use strict';

/**
 * Migration: Split Product into Master Catalog (Org-Scoped) and Inventory (Branch-Scoped) (FINDING-12 Phase 3A).
 *
 * Steps:
 * 1. Add nullable Products.organizationId if not present.
 * 2. Deterministic set-based backfill via Shops foreign key:
 *    UPDATE Products p JOIN Shops s ON s.id = p.shopId SET p.organizationId = s.organizationId WHERE p.organizationId IS NULL;
 * 3. PRE-FLIGHT COLLISION GATE:
 *    Execute SKU and barcode collision queries grouped by organizationId.
 *    If ANY collision detected, ABORT ENTIRELY, log diagnostic report, make ZERO schema changes.
 * 4. Create Inventory table (id, shopId, productId, stockQuantity, reorderPoint, timestamps, FKs ON DELETE CASCADE, unique (shopId, productId)).
 * 5. Backfill Inventory from Products (Case a 1:1 mapping).
 * 6. Enforce Products.organizationId NOT NULL and add FK constraint fk_products_organization_id (ON DELETE RESTRICT ON UPDATE CASCADE).
 * 7. Make Products.shopId nullable (retained as origin branch, ON DELETE SET NULL ON UPDATE CASCADE).
 * 8. Restructure unique indexes:
 *    - Drop unique_products_shop_sku and unique_products_shop_barcode.
 *    - Add unique_products_org_sku (organizationId, sku) and unique_products_org_barcode (organizationId, barcode).
 * 9. Add query index idx_products_org_createdAt (organizationId, createdAt).
 * 10. DO NOT drop Products.stockQuantity or Products.reorderPoint in this phase.
 * 11. Fully reversible down migration in reverse order.
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

async function addIndexIfNotExists(queryInterface, tableName, columns, indexName) {
  const existing = await getExistingIndexMap(queryInterface, tableName);
  if (!existing.has(indexName)) {
    await queryInterface.addIndex(tableName, columns, {
      name: indexName
    });
  }
}

async function getForeignKeysForColumn(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT CONSTRAINT_NAME 
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = '${tableName}' 
      AND COLUMN_NAME = '${columnName}' 
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  return rows.map(r => r.CONSTRAINT_NAME);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // -------------------------------------------------------------
    // Step 1: Add nullable Products.organizationId if not present
    // -------------------------------------------------------------
    const [productOrgCols] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `Products` LIKE 'organizationId'"
    );
    if (productOrgCols.length === 0) {
      await queryInterface.addColumn('Products', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: 'id'
      });
    }

    // -------------------------------------------------------------
    // Step 2: Atomic Set-Based Backfill of organizationId
    // -------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE \`Products\` p
      JOIN \`Shops\` s ON s.id = p.shopId
      SET p.organizationId = s.organizationId
      WHERE p.organizationId IS NULL
    `);

    // Safety assertion: zero unlinked records
    const [orphanProducts] = await queryInterface.sequelize.query(
      'SELECT id, name, shopId FROM `Products` WHERE organizationId IS NULL'
    );
    if (orphanProducts.length > 0) {
      throw new Error(
        `Cannot proceed with migration: found ${orphanProducts.length} orphan products with no organizationId`
      );
    }

    // -------------------------------------------------------------
    // Step 3: PRE-FLIGHT COLLISION GATE (Abort-and-Report)
    // -------------------------------------------------------------
    const [skuCollisions] = await queryInterface.sequelize.query(`
      SELECT 
        p.organizationId,
        p.sku,
        COUNT(*) AS collisionCount,
        GROUP_CONCAT(p.id ORDER BY p.id) AS productIds,
        GROUP_CONCAT(p.shopId ORDER BY p.shopId) AS shopIds,
        COUNT(DISTINCT p.name) AS distinctNames,
        COUNT(DISTINCT p.price) AS distinctPrices,
        COUNT(DISTINCT p.cost) AS distinctCosts,
        COUNT(DISTINCT p.categoryId) AS distinctCategories
      FROM \`Products\` p
      WHERE p.organizationId IS NOT NULL
      GROUP BY p.organizationId, p.sku
      HAVING COUNT(*) > 1
    `);

    const [barcodeCollisions] = await queryInterface.sequelize.query(`
      SELECT 
        p.organizationId,
        p.barcode,
        COUNT(*) AS collisionCount,
        GROUP_CONCAT(p.id ORDER BY p.id) AS productIds,
        GROUP_CONCAT(p.shopId ORDER BY p.shopId) AS shopIds,
        COUNT(DISTINCT p.name) AS distinctNames,
        COUNT(DISTINCT p.price) AS distinctPrices,
        COUNT(DISTINCT p.cost) AS distinctCosts,
        COUNT(DISTINCT p.categoryId) AS distinctCategories
      FROM \`Products\` p
      WHERE p.organizationId IS NOT NULL 
        AND p.barcode IS NOT NULL 
        AND p.barcode != ''
      GROUP BY p.organizationId, p.barcode
      HAVING COUNT(*) > 1
    `);

    if (skuCollisions.length > 0 || barcodeCollisions.length > 0) {
      let report = '\n================================================================================\n';
      report += '[MIGRATION ABORTED] Intra-organization SKU/barcode collisions detected!\n';
      report += 'Automated merging or deletion is disabled to prevent accidental data loss.\n';
      report += '================================================================================\n';

      if (skuCollisions.length > 0) {
        report += `Found ${skuCollisions.length} SKU collision group(s):\n`;
        for (const col of skuCollisions) {
          const namesMatch = col.distinctNames === 1 ? 'identical' : 'DIFFERENT';
          const pricesMatch = col.distinctPrices === 1 ? 'identical' : 'DIFFERENT';
          const costsMatch = col.distinctCosts === 1 ? 'identical' : 'DIFFERENT';
          const catsMatch = col.distinctCategories === 1 ? 'identical' : 'DIFFERENT';
          report += ` - Organization ID: ${col.organizationId} | SKU: '${col.sku}' | Count: ${col.collisionCount}\n`;
          report += `   Product IDs: [${col.productIds}] | Shop IDs: [${col.shopIds}]\n`;
          report += `   Field Divergence -> Names: ${namesMatch}, Prices: ${pricesMatch}, Costs: ${costsMatch}, Categories: ${catsMatch}\n`;
        }
      }

      if (barcodeCollisions.length > 0) {
        report += `Found ${barcodeCollisions.length} Barcode collision group(s):\n`;
        for (const col of barcodeCollisions) {
          const namesMatch = col.distinctNames === 1 ? 'identical' : 'DIFFERENT';
          const pricesMatch = col.distinctPrices === 1 ? 'identical' : 'DIFFERENT';
          report += ` - Organization ID: ${col.organizationId} | Barcode: '${col.barcode}' | Count: ${col.collisionCount}\n`;
          report += `   Product IDs: [${col.productIds}] | Shop IDs: [${col.shopIds}]\n`;
          report += `   Field Divergence -> Names: ${namesMatch}, Prices: ${pricesMatch}\n`;
        }
      }

      report += '================================================================================\n';
      report += 'Action Required: A human-reviewed, one-off resolution script must resolve these\n';
      report += 'duplicates before running this migration.\n';
      report += '================================================================================\n';

      console.error(report);
      throw new Error(`[MIGRATION ABORTED] Collision check failed: ${skuCollisions.length} SKU collisions, ${barcodeCollisions.length} barcode collisions detected.`);
    }

    // -------------------------------------------------------------
    // Step 4: Create Inventory Table
    // -------------------------------------------------------------
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'Inventory'");
    if (tables.length === 0) {
      await queryInterface.createTable('Inventory', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Shops',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        productId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'Products',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        stockQuantity: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        reorderPoint: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 10
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
    }

    await addUniqueIndexIfNotExists(
      queryInterface,
      'Inventory',
      ['shopId', 'productId'],
      'unique_inventory_shop_product'
    );

    await addIndexIfNotExists(
      queryInterface,
      'Inventory',
      ['shopId', 'stockQuantity'],
      'idx_inventory_shop_stock'
    );

    // -------------------------------------------------------------
    // Step 5: Backfill Inventory from Products (Case a 1:1 mapping)
    // -------------------------------------------------------------
    await queryInterface.sequelize.query(`
      INSERT INTO \`Inventory\` (\`shopId\`, \`productId\`, \`stockQuantity\`, \`reorderPoint\`, \`createdAt\`, \`updatedAt\`)
      SELECT 
        p.shopId, 
        p.id, 
        COALESCE(p.stockQuantity, 0), 
        COALESCE(p.reorderPoint, 10), 
        NOW(), 
        NOW()
      FROM \`Products\` p
      LEFT JOIN \`Inventory\` i ON i.shopId = p.shopId AND i.productId = p.id
      WHERE i.id IS NULL
    `);

    // -------------------------------------------------------------
    // Step 6: Enforce Products.organizationId NOT NULL & Add FK
    // -------------------------------------------------------------
    await queryInterface.changeColumn('Products', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    const [prodOrgFkCheck] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Products' AND CONSTRAINT_NAME = 'fk_products_organization_id'
    `);
    if (prodOrgFkCheck.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Products\` ADD CONSTRAINT \`fk_products_organization_id\` 
        FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) 
        ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }

    // -------------------------------------------------------------
    // Step 7: Make Products.shopId Nullable (Origin Branch)
    // -------------------------------------------------------------
    await addIndexIfNotExists(queryInterface, 'Products', ['shopId'], 'idx_products_shop_id');

    const productShopFks = await getForeignKeysForColumn(queryInterface, 'Products', 'shopId');
    for (const fk of productShopFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Products\` DROP FOREIGN KEY \`${fk}\``);
    }
    await queryInterface.changeColumn('Products', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    const [prodShopFkCheck] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Products' AND CONSTRAINT_NAME = 'fk_products_shop_id'
    `);
    if (prodShopFkCheck.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Products\` ADD CONSTRAINT \`fk_products_shop_id\` 
        FOREIGN KEY (\`shopId\`) REFERENCES \`Shops\` (\`id\`) 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    // -------------------------------------------------------------
    // Step 8: Restructure Unique Constraints on Products
    // -------------------------------------------------------------
    const productSkuIndexesToDrop = [
      'unique_products_shop_sku',
      'Products_sku_unique',
      'sku', 'sku_2', 'sku_3', 'sku_4', 'sku_5'
    ];
    for (const idx of productSkuIndexesToDrop) {
      await dropIndexIfExists(queryInterface, 'Products', idx);
    }

    const productBarcodeIndexesToDrop = [
      'unique_products_shop_barcode',
      'Products_barcode_unique',
      'barcode', 'barcode_2', 'barcode_3', 'barcode_4', 'barcode_5'
    ];
    for (const idx of productBarcodeIndexesToDrop) {
      await dropIndexIfExists(queryInterface, 'Products', idx);
    }

    await addUniqueIndexIfNotExists(
      queryInterface,
      'Products',
      ['organizationId', 'sku'],
      'unique_products_org_sku'
    );

    await addUniqueIndexIfNotExists(
      queryInterface,
      'Products',
      ['organizationId', 'barcode'],
      'unique_products_org_barcode'
    );

    // -------------------------------------------------------------
    // Step 9: Add Query Index idx_products_org_createdAt
    // -------------------------------------------------------------
    await addIndexIfNotExists(
      queryInterface,
      'Products',
      ['organizationId', 'createdAt'],
      'idx_products_org_createdAt'
    );
  },

  async down(queryInterface, Sequelize) {
    // -------------------------------------------------------------
    // Step 1: Drop Foreign Keys on Products
    // -------------------------------------------------------------
    const prodOrgFks = await getForeignKeysForColumn(queryInterface, 'Products', 'organizationId');
    for (const fk of prodOrgFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Products\` DROP FOREIGN KEY \`${fk}\``);
    }

    const prodShopFks = await getForeignKeysForColumn(queryInterface, 'Products', 'shopId');
    for (const fk of prodShopFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Products\` DROP FOREIGN KEY \`${fk}\``);
    }

    // -------------------------------------------------------------
    // Step 2: Revert Indexes on Products
    // -------------------------------------------------------------
    await dropIndexIfExists(queryInterface, 'Products', 'idx_products_org_createdAt');
    await dropIndexIfExists(queryInterface, 'Products', 'unique_products_org_barcode');
    await dropIndexIfExists(queryInterface, 'Products', 'unique_products_org_sku');

    await addUniqueIndexIfNotExists(
      queryInterface,
      'Products',
      ['shopId', 'sku'],
      'unique_products_shop_sku'
    );

    await addUniqueIndexIfNotExists(
      queryInterface,
      'Products',
      ['shopId', 'barcode'],
      'unique_products_shop_barcode'
    );

    // -------------------------------------------------------------
    // Step 3: Restore Stock from Inventory back into Products
    // -------------------------------------------------------------
    const [invTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'Inventory'");
    if (invTables.length > 0) {
      await queryInterface.sequelize.query(`
        UPDATE \`Products\` p
        JOIN \`Inventory\` i ON i.productId = p.id AND i.shopId = p.shopId
        SET p.stockQuantity = i.stockQuantity, p.reorderPoint = i.reorderPoint
      `);
    }

    // -------------------------------------------------------------
    // Step 4: Restore Products.shopId NOT NULL & Re-add FK
    // -------------------------------------------------------------
    // Clean null shopId if any exist before enforcing NOT NULL
    await queryInterface.sequelize.query(`
      UPDATE \`Products\` p
      JOIN \`Inventory\` i ON i.productId = p.id
      SET p.shopId = i.shopId
      WHERE p.shopId IS NULL
    `);

    await queryInterface.changeColumn('Products', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE \`Products\` ADD CONSTRAINT \`Products_ibfk_shop\` 
      FOREIGN KEY (\`shopId\`) REFERENCES \`Shops\` (\`id\`) 
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // -------------------------------------------------------------
    // Step 5: Drop organizationId Column from Products
    // -------------------------------------------------------------
    const [cols] = await queryInterface.sequelize.query("SHOW COLUMNS FROM `Products` LIKE 'organizationId'");
    if (cols.length > 0) {
      await queryInterface.removeColumn('Products', 'organizationId');
    }

    // -------------------------------------------------------------
    // Step 6: Drop Inventory Table
    // -------------------------------------------------------------
    if (invTables.length > 0) {
      await queryInterface.dropTable('Inventory');
    }
  }
};
