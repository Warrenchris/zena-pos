'use strict';

async function executeSqlBlock(queryInterface, sqlBlock) {
  const statements = sqlBlock.split(';').map(s => s.trim()).filter(s => s.length > 0);
  await queryInterface.sequelize.transaction(async (transaction) => {
    for (const stmt of statements) {
      await queryInterface.sequelize.query(stmt, { transaction });
    }
  });
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1 - Drop stale/conflicting FK constraints (idempotent)
    const dropIbfk2 = `
      SET @exist := (
        SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
        WHERE CONSTRAINT_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'SalePayments' 
        AND CONSTRAINT_NAME = 'SalePayments_ibfk_2' 
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      );
      SET @sql := IF(@exist > 0, 
        'ALTER TABLE SalePayments DROP FOREIGN KEY SalePayments_ibfk_2', 
        'SELECT 1'
      );
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    `;
    await executeSqlBlock(queryInterface, dropIbfk2);

    const dropFkProcessedBy = `
      SET @exist := (
        SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
        WHERE CONSTRAINT_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'SalePayments' 
        AND CONSTRAINT_NAME = 'fk_salepayments_processedBy' 
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      );
      SET @sql := IF(@exist > 0, 
        'ALTER TABLE SalePayments DROP FOREIGN KEY fk_salepayments_processedBy', 
        'SELECT 1'
      );
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    `;
    await executeSqlBlock(queryInterface, dropFkProcessedBy);

    // Step 2 - Alter column to UUID-compatible type
    await queryInterface.sequelize.query(`
      ALTER TABLE SalePayments 
        MODIFY COLUMN processedBy 
        CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL;
    `);

    // Step 3 - Apply the FK constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE SalePayments 
        ADD CONSTRAINT fk_salepayments_processedBy 
        FOREIGN KEY (processedBy) REFERENCES Employees(id) 
        ON UPDATE CASCADE 
        ON DELETE SET NULL;
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop fk_salepayments_processedBy if it exists
    const dropFkProcessedBy = `
      SET @exist := (
        SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
        WHERE CONSTRAINT_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'SalePayments' 
        AND CONSTRAINT_NAME = 'fk_salepayments_processedBy' 
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      );
      SET @sql := IF(@exist > 0, 
        'ALTER TABLE SalePayments DROP FOREIGN KEY fk_salepayments_processedBy', 
        'SELECT 1'
      );
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    `;
    await executeSqlBlock(queryInterface, dropFkProcessedBy);

    // Revert column to VARCHAR(36) with default collation, keeping NULL allowed
    await queryInterface.sequelize.query(`
      ALTER TABLE SalePayments 
        MODIFY COLUMN processedBy VARCHAR(36) NULL;
    `);
  }
};
