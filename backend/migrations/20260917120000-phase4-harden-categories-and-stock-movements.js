'use strict';

/**
 * Phase 4 Migration: Harden Categories and StockMovements for Multi-Tenancy
 *
 * IDEMPOTENT: safe to re-run after a partial failure.
 *
 * Categories:
 *   1. Add nullable organizationId (skip if exists)
 *   2. Backfill from Shops.organizationId
 *   3. Make NOT NULL + FK
 *   4. Drop global Categories_name_unique (if exists)
 *   5. Add unique_categories_org_name (organizationId, name) (skip if exists)
 *
 * StockMovements:
 *   6. Add employeeId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin (raw SQL for FK compat)
 *   7. Add organizationId INT + FK to Organizations(id)
 *   8. Backfill organizationId from Shops.organizationId
 */

async function columnExists(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND COLUMN_NAME = '${column}'
     LIMIT 1`
  );
  return rows.length > 0;
}

async function indexExists(queryInterface, table, indexName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}' AND INDEX_NAME = '${indexName}'
     LIMIT 1`
  );
  return rows.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // ========================================================================
    // CATEGORIES: Add organizationId
    // ========================================================================

    // 1. Add nullable organizationId to Categories (skip if already exists)
    if (!(await columnExists(queryInterface, 'Categories', 'organizationId'))) {
      await queryInterface.addColumn('Categories', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Organizations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });
    }

    // 2. Backfill: Categories.organizationId = Shops.organizationId via shopId
    await queryInterface.sequelize.query(`
      UPDATE Categories c
      JOIN Shops s ON s.id = c.shopId
      SET c.organizationId = s.organizationId
      WHERE c.organizationId IS NULL
    `);

    // 3. Verify all categories have organizationId
    const [unbackfilled] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as cnt FROM Categories WHERE organizationId IS NULL'
    );
    if (unbackfilled[0].cnt > 0) {
      throw new Error(`${unbackfilled[0].cnt} categories still have NULL organizationId after backfill. Aborting.`);
    }

    // 4. Make organizationId NOT NULL (idempotent — ALTER is safe to re-run)
    await queryInterface.sequelize.query(`
      ALTER TABLE Categories
      MODIFY organizationId INT NOT NULL
    `);

    // Ensure FK exists (add if missing)
    const [catFks] = await queryInterface.sequelize.query(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Categories'
        AND COLUMN_NAME = 'organizationId' AND REFERENCED_TABLE_NAME = 'Organizations'
      LIMIT 1
    `);
    if (catFks.length === 0) {
      await queryInterface.sequelize.query(`
        ALTER TABLE Categories
        ADD CONSTRAINT fk_categories_organization
        FOREIGN KEY (organizationId) REFERENCES Organizations(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
      `);
    }

    // 5. Drop the global Categories_name_unique index (if it exists)
    if (await indexExists(queryInterface, 'Categories', 'Categories_name_unique')) {
      await queryInterface.removeIndex('Categories', 'Categories_name_unique');
    }

    // 6. Add org-scoped unique index (organizationId, name) — skip if exists
    if (!(await indexExists(queryInterface, 'Categories', 'unique_categories_org_name'))) {
      // Check for duplicates first
      const [dupes] = await queryInterface.sequelize.query(`
        SELECT organizationId, name, COUNT(*) as cnt
        FROM Categories
        GROUP BY organizationId, name
        HAVING cnt > 1
      `);
      if (dupes.length > 0) {
        throw new Error(
          `Duplicate category names found per organization: ${JSON.stringify(dupes)}. ` +
          `Cannot add unique constraint. Manual deduplication required.`
        );
      }

      await queryInterface.addIndex('Categories', ['organizationId', 'name'], {
        unique: true,
        name: 'unique_categories_org_name'
      });
    }

    // ========================================================================
    // STOCKMOVEMENTS: Add employeeId and organizationId
    // ========================================================================

    // 7. Add employeeId using RAW SQL to match Employee.id charset/collation exactly
    //    Employee.id is CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
    if (!(await columnExists(queryInterface, 'StockMovements', 'employeeId'))) {
      await queryInterface.sequelize.query(`
        ALTER TABLE StockMovements
        ADD COLUMN employeeId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
        ADD CONSTRAINT fk_stockmovements_employee
          FOREIGN KEY (employeeId) REFERENCES Employees(id)
          ON UPDATE CASCADE ON DELETE SET NULL
      `);
    }

    // 8. Add organizationId to StockMovements (skip if exists)
    if (!(await columnExists(queryInterface, 'StockMovements', 'organizationId'))) {
      await queryInterface.addColumn('StockMovements', 'organizationId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Organizations', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // 9. Backfill StockMovements.organizationId from Shops.organizationId
    await queryInterface.sequelize.query(`
      UPDATE StockMovements sm
      JOIN Shops s ON s.id = sm.shopId
      SET sm.organizationId = s.organizationId
      WHERE sm.organizationId IS NULL
    `);

    // 10. Add indexes (skip if exist)
    if (!(await indexExists(queryInterface, 'StockMovements', 'idx_stockmovements_org'))) {
      await queryInterface.addIndex('StockMovements', ['organizationId'], {
        name: 'idx_stockmovements_org'
      });
    }

    if (!(await indexExists(queryInterface, 'StockMovements', 'idx_stockmovements_employee'))) {
      await queryInterface.addIndex('StockMovements', ['employeeId'], {
        name: 'idx_stockmovements_employee'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Reverse StockMovements changes
    try { await queryInterface.removeIndex('StockMovements', 'idx_stockmovements_employee'); } catch (e) { /* ignore */ }
    try { await queryInterface.removeIndex('StockMovements', 'idx_stockmovements_org'); } catch (e) { /* ignore */ }

    if (await columnExists(queryInterface, 'StockMovements', 'organizationId')) {
      await queryInterface.removeColumn('StockMovements', 'organizationId');
    }
    if (await columnExists(queryInterface, 'StockMovements', 'employeeId')) {
      // Drop FK first, then column
      try {
        await queryInterface.sequelize.query(
          'ALTER TABLE StockMovements DROP FOREIGN KEY fk_stockmovements_employee'
        );
      } catch (e) { /* ignore — may not exist */ }
      await queryInterface.removeColumn('StockMovements', 'employeeId');
    }

    // Reverse Categories changes
    if (await indexExists(queryInterface, 'Categories', 'unique_categories_org_name')) {
      await queryInterface.removeIndex('Categories', 'unique_categories_org_name');
    }

    // Re-add the global name unique index
    if (!(await indexExists(queryInterface, 'Categories', 'Categories_name_unique'))) {
      await queryInterface.addIndex('Categories', ['name'], {
        unique: true,
        name: 'Categories_name_unique'
      });
    }

    if (await columnExists(queryInterface, 'Categories', 'organizationId')) {
      // Drop FK first
      try {
        await queryInterface.sequelize.query(
          'ALTER TABLE Categories DROP FOREIGN KEY fk_categories_organization'
        );
      } catch (e) { /* ignore */ }
      await queryInterface.removeColumn('Categories', 'organizationId');
    }
  }
};

