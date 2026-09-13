'use strict';

/**
 * Migration: Migrate Customer and Supplier from shop-scoped to organization-scoped (FINDING-12 Phase 2).
 *
 * Steps:
 * 1. Add nullable organizationId INTEGER to Customers and Suppliers.
 * 2. Deterministic set-based backfill via Shops foreign key:
 *    UPDATE Customers c JOIN Shops s ON s.id = c.shopId SET c.organizationId = s.organizationId;
 *    UPDATE Suppliers sup JOIN Shops s ON s.id = sup.shopId SET sup.organizationId = s.organizationId;
 * 3. Enforce organizationId NOT NULL.
 * 4. Make Customers.shopId and Suppliers.shopId nullable (retained as "origin branch" informational field, ON DELETE SET NULL).
 *    Add idx_suppliers_shop_id so foreign key on shopId does not lock suppliers_shop_name_idx.
 * 5. Add FK constraints with ON DELETE RESTRICT on organizationId (fk_customers_organization_id, fk_suppliers_organization_id).
 * 6. Unique constraint restructuring (idempotent):
 *    - Customers: drop unique_customers_shop_email (shopId, email), add unique_customers_org_email (organizationId, email)
 *    - Suppliers: drop suppliers_shop_name_idx (shopId, name), add unique_suppliers_org_name UNIQUE (organizationId, name)
 *    - Non-unique query indexes: idx_customers_org_createdAt, idx_suppliers_org_createdAt
 * 7. Fully reversible down migration in reverse order.
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
    // Step 1: Add nullable organizationId columns if not present
    // -------------------------------------------------------------
    const [customerOrgCols] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `Customers` LIKE 'organizationId'"
    );
    if (customerOrgCols.length === 0) {
      await queryInterface.addColumn('Customers', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: 'id'
      });
    }

    const [supplierOrgCols] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM `Suppliers` LIKE 'organizationId'"
    );
    if (supplierOrgCols.length === 0) {
      await queryInterface.addColumn('Suppliers', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: 'id'
      });
    }

    // -------------------------------------------------------------
    // Step 2: Deterministic Set-Based Backfill via Shops FK
    // -------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE \`Customers\` c
      JOIN \`Shops\` s ON s.id = c.shopId
      SET c.organizationId = s.organizationId
      WHERE c.organizationId IS NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE \`Suppliers\` sup
      JOIN \`Shops\` s ON s.id = sup.shopId
      SET sup.organizationId = s.organizationId
      WHERE sup.organizationId IS NULL
    `);

    // Safety assertion: zero unlinked records
    const [orphanCustomers] = await queryInterface.sequelize.query(
      'SELECT id, name, shopId FROM `Customers` WHERE organizationId IS NULL'
    );
    if (orphanCustomers.length > 0) {
      throw new Error(
        `Cannot enforce NOT NULL on Customers.organizationId: found ${orphanCustomers.length} orphan customers`
      );
    }

    const [orphanSuppliers] = await queryInterface.sequelize.query(
      'SELECT id, name, shopId FROM `Suppliers` WHERE organizationId IS NULL'
    );
    if (orphanSuppliers.length > 0) {
      throw new Error(
        `Cannot enforce NOT NULL on Suppliers.organizationId: found ${orphanSuppliers.length} orphan suppliers`
      );
    }

    // -------------------------------------------------------------
    // Step 3: Enforce organizationId NOT NULL
    // -------------------------------------------------------------
    await queryInterface.changeColumn('Customers', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    await queryInterface.changeColumn('Suppliers', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    // -------------------------------------------------------------
    // Step 4: Make shopId Nullable (Origin Branch, ON DELETE SET NULL)
    // -------------------------------------------------------------
    // Ensure shopId in Suppliers has its own backing index so dropping suppliers_shop_name_idx is allowed
    await addIndexIfNotExists(queryInterface, 'Suppliers', ['shopId'], 'idx_suppliers_shop_id');
    await addIndexIfNotExists(queryInterface, 'Customers', ['shopId'], 'idx_customers_shop_id');

    const customerShopFks = await getForeignKeysForColumn(queryInterface, 'Customers', 'shopId');
    for (const fk of customerShopFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Customers\` DROP FOREIGN KEY \`${fk}\``);
    }
    await queryInterface.changeColumn('Customers', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    const [custShopFkCheck] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Customers' AND CONSTRAINT_NAME = 'fk_customers_shop_id'
    `);
    if (custShopFkCheck.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Customers\` ADD CONSTRAINT \`fk_customers_shop_id\` 
        FOREIGN KEY (\`shopId\`) REFERENCES \`Shops\` (\`id\`) 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    const supplierShopFks = await getForeignKeysForColumn(queryInterface, 'Suppliers', 'shopId');
    for (const fk of supplierShopFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Suppliers\` DROP FOREIGN KEY \`${fk}\``);
    }
    await queryInterface.changeColumn('Suppliers', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    const [supShopFkCheck] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Suppliers' AND CONSTRAINT_NAME = 'fk_suppliers_shop_id'
    `);
    if (supShopFkCheck.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Suppliers\` ADD CONSTRAINT \`fk_suppliers_shop_id\` 
        FOREIGN KEY (\`shopId\`) REFERENCES \`Shops\` (\`id\`) 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    // -------------------------------------------------------------
    // Step 5: Add Foreign Key Constraints on organizationId (ON DELETE RESTRICT)
    // -------------------------------------------------------------
    const [custFk] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Customers' AND CONSTRAINT_NAME = 'fk_customers_organization_id'
    `);
    if (custFk.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Customers\` ADD CONSTRAINT \`fk_customers_organization_id\` 
        FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) 
        ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }

    const [supFk] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Suppliers' AND CONSTRAINT_NAME = 'fk_suppliers_organization_id'
    `);
    if (supFk.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE \`Suppliers\` ADD CONSTRAINT \`fk_suppliers_organization_id\` 
        FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) 
        ON DELETE RESTRICT ON UPDATE CASCADE
      `);
    }

    // -------------------------------------------------------------
    // Step 6: Unique Constraint Restructuring & Query Indexes
    // -------------------------------------------------------------
    // Customers: drop unique_customers_shop_email and any legacy global email unique indexes
    const customerEmailIndexesToDrop = [
      'unique_customers_shop_email',
      'Customers_email_unique',
      'email', 'email_2', 'email_3', 'email_4', 'email_5'
    ];
    for (const idx of customerEmailIndexesToDrop) {
      await dropIndexIfExists(queryInterface, 'Customers', idx);
    }
    await addUniqueIndexIfNotExists(
      queryInterface,
      'Customers',
      ['organizationId', 'email'],
      'unique_customers_org_email'
    );
    await addIndexIfNotExists(
      queryInterface,
      'Customers',
      ['organizationId', 'createdAt'],
      'idx_customers_org_createdAt'
    );

    // Suppliers: drop suppliers_shop_name_idx and any legacy global name unique indexes
    const supplierNameIndexesToDrop = [
      'suppliers_shop_name_idx',
      'Suppliers_name_unique',
      'name', 'name_2', 'name_3', 'name_4', 'name_5'
    ];
    for (const idx of supplierNameIndexesToDrop) {
      await dropIndexIfExists(queryInterface, 'Suppliers', idx);
    }
    await addUniqueIndexIfNotExists(
      queryInterface,
      'Suppliers',
      ['organizationId', 'name'],
      'unique_suppliers_org_name'
    );
    await addIndexIfNotExists(
      queryInterface,
      'Suppliers',
      ['organizationId', 'createdAt'],
      'idx_suppliers_org_createdAt'
    );
  },

  async down(queryInterface, Sequelize) {
    // -------------------------------------------------------------
    // Step 1: Drop organizationId FK Constraints FIRST (avoids index dependency error)
    // -------------------------------------------------------------
    const custOrgFks = await getForeignKeysForColumn(queryInterface, 'Customers', 'organizationId');
    for (const fk of custOrgFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Customers\` DROP FOREIGN KEY \`${fk}\``);
    }

    const supOrgFks = await getForeignKeysForColumn(queryInterface, 'Suppliers', 'organizationId');
    for (const fk of supOrgFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Suppliers\` DROP FOREIGN KEY \`${fk}\``);
    }

    // -------------------------------------------------------------
    // Step 2: Revert Indexes on Suppliers
    // -------------------------------------------------------------
    await dropIndexIfExists(queryInterface, 'Suppliers', 'idx_suppliers_org_createdAt');
    await dropIndexIfExists(queryInterface, 'Suppliers', 'unique_suppliers_org_name');
    await addIndexIfNotExists(
      queryInterface,
      'Suppliers',
      ['shopId', 'name'],
      'suppliers_shop_name_idx'
    );
    await dropIndexIfExists(queryInterface, 'Suppliers', 'idx_suppliers_shop_id');

    // -------------------------------------------------------------
    // Step 3: Revert Indexes on Customers
    // -------------------------------------------------------------
    await dropIndexIfExists(queryInterface, 'Customers', 'idx_customers_org_createdAt');
    await dropIndexIfExists(queryInterface, 'Customers', 'unique_customers_org_email');
    await addUniqueIndexIfNotExists(
      queryInterface,
      'Customers',
      ['shopId', 'email'],
      'unique_customers_shop_email'
    );
    await dropIndexIfExists(queryInterface, 'Customers', 'idx_customers_shop_id');

    // -------------------------------------------------------------
    // Step 4: Revert shopId Nullability & FK on Suppliers
    // -------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE \`Suppliers\` sup
      JOIN \`Shops\` s ON s.organizationId = sup.organizationId
      SET sup.shopId = s.id
      WHERE sup.shopId IS NULL
    `);

    const currentSupShopFks = await getForeignKeysForColumn(queryInterface, 'Suppliers', 'shopId');
    for (const fk of currentSupShopFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Suppliers\` DROP FOREIGN KEY \`${fk}\``);
    }
    await queryInterface.changeColumn('Suppliers', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Suppliers\` ADD CONSTRAINT \`Suppliers_ibfk_1\` 
      FOREIGN KEY (\`shopId\`) REFERENCES \`Shops\` (\`id\`) 
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // -------------------------------------------------------------
    // Step 5: Revert shopId Nullability & FK on Customers
    // -------------------------------------------------------------
    await queryInterface.sequelize.query(`
      UPDATE \`Customers\` c
      JOIN \`Shops\` s ON s.organizationId = c.organizationId
      SET c.shopId = s.id
      WHERE c.shopId IS NULL
    `);

    const currentCustShopFks = await getForeignKeysForColumn(queryInterface, 'Customers', 'shopId');
    for (const fk of currentCustShopFks) {
      await queryInterface.sequelize.query(`ALTER TABLE \`Customers\` DROP FOREIGN KEY \`${fk}\``);
    }
    await queryInterface.changeColumn('Customers', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE \`Customers\` ADD CONSTRAINT \`Customers_ibfk_1\` 
      FOREIGN KEY (\`shopId\`) REFERENCES \`Shops\` (\`id\`) 
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // -------------------------------------------------------------
    // Step 6: Drop organizationId Columns
    // -------------------------------------------------------------
    await dropIndexIfExists(queryInterface, 'Suppliers', 'fk_suppliers_organization_id');
    await queryInterface.removeColumn('Suppliers', 'organizationId');

    await dropIndexIfExists(queryInterface, 'Customers', 'fk_customers_organization_id');
    await queryInterface.removeColumn('Customers', 'organizationId');
  }
};
