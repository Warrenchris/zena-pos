'use strict';

/**
 * Migration: Enforce StockMovement organizationId NOT NULL & Create StockTransfers Table
 *
 * 1. Validates no NULL organizationId rows exist in StockMovements.
 * 2. Hardens StockMovements.organizationId to INT NOT NULL with RESTRICT FK.
 * 3. Creates StockTransfers table with tenant-scoped composite unique constraint:
 *    unique_stock_transfers_org_idempotency_key (organizationId, idempotencyKey).
 */

async function foreignKeyExists(queryInterface, table, constraintName) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${table}'
      AND CONSTRAINT_NAME = '${constraintName}' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    LIMIT 1
  `);
  return rows.length > 0;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    // ========================================================================
    // 1. HARDEN StockMovements.organizationId TO NOT NULL
    // ========================================================================
    const [orgCol] = await queryInterface.sequelize.query(`
      SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StockMovements' AND COLUMN_NAME = 'organizationId'
    `);

    if (orgCol.length > 0 && orgCol[0].IS_NULLABLE === 'YES') {
      // Safety verification: Ensure 0 NULL rows exist
      const [nullRows] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM StockMovements WHERE organizationId IS NULL
      `);
      if (nullRows[0].count > 0) {
        throw new Error(
          `Discovered ${nullRows[0].count} StockMovements with NULL organizationId. ` +
          `Refusing to apply NOT NULL constraint until data is clean.`
        );
      }

      // Identify and drop existing FK constraints on StockMovements.organizationId
      const [existingFks] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'StockMovements'
          AND COLUMN_NAME = 'organizationId'
          AND REFERENCED_TABLE_NAME = 'Organizations'
      `);
      for (const fk of existingFks) {
        await queryInterface.sequelize.query(
          `ALTER TABLE StockMovements DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``
        );
      }

      // Modify column to NOT NULL
      await queryInterface.sequelize.query(`
        ALTER TABLE StockMovements
        MODIFY organizationId INT NOT NULL
      `);

      // Add RESTRICT foreign key
      await queryInterface.sequelize.query(`
        ALTER TABLE StockMovements
        ADD CONSTRAINT fk_stockmovements_organization
        FOREIGN KEY (organizationId) REFERENCES Organizations(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
      `);
    }

    // ========================================================================
    // 2. CREATE StockTransfers TABLE FOR DURABLE IDEMPOTENCY & AUDIT
    // ========================================================================
    const [tableExists] = await queryInterface.sequelize.query(`
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StockTransfers'
      LIMIT 1
    `);

    // Clean up if a previous attempt partially created the table
    if (tableExists.length > 0) {
      await queryInterface.dropTable('StockTransfers');
    }

    await queryInterface.createTable('StockTransfers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      organizationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Organizations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      idempotencyKey: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      requestHash: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      reference: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      sourceShopId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Shops',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      destinationShopId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Shops',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      productId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      quantity: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      responsePayload: {
        type: Sequelize.JSON,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'COMPLETED'
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      employeeId: {
        type: Sequelize.CHAR(36),
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Match Employee.id charset/collation exactly (CHAR(36) utf8mb4_bin) and add FK
    await queryInterface.sequelize.query(`
      ALTER TABLE StockTransfers
      MODIFY COLUMN employeeId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      ADD CONSTRAINT fk_stocktransfers_employee
        FOREIGN KEY (employeeId) REFERENCES Employees(id)
        ON UPDATE CASCADE ON DELETE SET NULL
    `);

    // Composite unique constraint: (organizationId, idempotencyKey)
    await queryInterface.addIndex('StockTransfers', ['organizationId', 'idempotencyKey'], {
      unique: true,
      name: 'unique_stock_transfers_org_idempotency_key'
    });

    await queryInterface.addIndex('StockTransfers', ['organizationId'], {
      name: 'idx_stock_transfers_org'
    });

    await queryInterface.addIndex('StockTransfers', ['sourceShopId'], {
      name: 'idx_stock_transfers_source_shop'
    });

    await queryInterface.addIndex('StockTransfers', ['destinationShopId'], {
      name: 'idx_stock_transfers_dest_shop'
    });
  },

  async down(queryInterface, Sequelize) {
    // 1. Drop StockTransfers table
    await queryInterface.dropTable('StockTransfers');

    // 2. Revert StockMovements.organizationId to nullable with SET NULL FK
    if (await foreignKeyExists(queryInterface, 'StockMovements', 'fk_stockmovements_organization')) {
      await queryInterface.sequelize.query(
        'ALTER TABLE StockMovements DROP FOREIGN KEY fk_stockmovements_organization'
      );
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE StockMovements
      MODIFY organizationId INT NULL
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE StockMovements
      ADD CONSTRAINT StockMovements_organizationId_foreign_idx
      FOREIGN KEY (organizationId) REFERENCES Organizations(id)
      ON UPDATE CASCADE ON DELETE SET NULL
    `);
  }
};
