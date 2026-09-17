'use strict';

/**
 * Phase 4 Migration: Harden Categories and StockMovements for Multi-Tenancy
 * 
 * Categories:
 *   1. Add nullable organizationId
 *   2. Backfill from Shops.organizationId
 *   3. Make NOT NULL + FK
 *   4. Drop global Categories_name_unique
 *   5. Add unique_categories_org_name (organizationId, name)
 * 
 * StockMovements:
 *   6. Add nullable employeeId CHAR(36) + FK to Employees(id)
 *   7. Add nullable organizationId INT + FK to Organizations(id)
 *   8. Backfill organizationId from Shops.organizationId
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ========================================================================
    // CATEGORIES: Add organizationId
    // ========================================================================

    // 1. Add nullable organizationId to Categories
    await queryInterface.addColumn('Categories', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Organizations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    // 2. Backfill: Categories.organizationId = Shops.organizationId via shopId
    await queryInterface.sequelize.query(`
      UPDATE Categories c
      JOIN Shops s ON s.id = c.shopId
      SET c.organizationId = s.organizationId
    `);

    // 3. Verify all categories have organizationId
    const [unbackfilled] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as cnt FROM Categories WHERE organizationId IS NULL'
    );
    if (unbackfilled[0].cnt > 0) {
      throw new Error(`${unbackfilled[0].cnt} categories still have NULL organizationId after backfill. Aborting.`);
    }

    // 4. Make organizationId NOT NULL
    await queryInterface.changeColumn('Categories', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'Organizations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    // 5. Check for duplicate (organizationId, name) before adding unique constraint
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

    // 6. Drop the global Categories_name_unique index (if it exists)
    try {
      await queryInterface.removeIndex('Categories', 'Categories_name_unique');
    } catch (e) {
      // Index may not exist — safe to continue
      console.log('Note: Categories_name_unique index not found or already dropped:', e.message);
    }

    // 7. Add org-scoped unique index (organizationId, name)
    await queryInterface.addIndex('Categories', ['organizationId', 'name'], {
      unique: true,
      name: 'unique_categories_org_name'
    });

    // ========================================================================
    // STOCKMOVEMENTS: Add employeeId and organizationId
    // ========================================================================

    // 8. Add nullable employeeId CHAR(36) to StockMovements
    await queryInterface.addColumn('StockMovements', 'employeeId', {
      type: Sequelize.CHAR(36),
      allowNull: true,
      references: { model: 'Employees', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // 9. Add nullable organizationId to StockMovements
    await queryInterface.addColumn('StockMovements', 'organizationId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'Organizations', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // 10. Backfill StockMovements.organizationId from Shops.organizationId
    await queryInterface.sequelize.query(`
      UPDATE StockMovements sm
      JOIN Shops s ON s.id = sm.shopId
      SET sm.organizationId = s.organizationId
    `);

    // 11. Add index on StockMovements.organizationId for tenant-level filtering
    await queryInterface.addIndex('StockMovements', ['organizationId'], {
      name: 'idx_stockmovements_org'
    });

    // 12. Add index on StockMovements.employeeId
    await queryInterface.addIndex('StockMovements', ['employeeId'], {
      name: 'idx_stockmovements_employee'
    });
  },

  async down(queryInterface, Sequelize) {
    // Reverse StockMovements changes
    try { await queryInterface.removeIndex('StockMovements', 'idx_stockmovements_employee'); } catch (e) { /* ignore */ }
    try { await queryInterface.removeIndex('StockMovements', 'idx_stockmovements_org'); } catch (e) { /* ignore */ }
    await queryInterface.removeColumn('StockMovements', 'organizationId');
    await queryInterface.removeColumn('StockMovements', 'employeeId');

    // Reverse Categories changes
    try { await queryInterface.removeIndex('Categories', 'unique_categories_org_name'); } catch (e) { /* ignore */ }
    
    // Re-add the global name unique index
    await queryInterface.addIndex('Categories', ['name'], {
      unique: true,
      name: 'Categories_name_unique'
    });
    
    await queryInterface.removeColumn('Categories', 'organizationId');
  }
};
