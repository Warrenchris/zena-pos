'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const [results] = await queryInterface.sequelize.query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('createdBy', 'updatedBy', 'processedBy', 'employeeId', 'approvedBy', 'authorizedBy', 'deletedBy', 'refundedBy', 'lastModifiedBy')
        AND DATA_TYPE = 'varchar'
    `);

    let columns = results;
    if (columns.length === 0) {
      console.log('No matching varchar columns found in query, using fallback list.');
      columns = [
        { TABLE_NAME: 'SaleRefunds', COLUMN_NAME: 'refundedBy' },
        { TABLE_NAME: 'Sales', COLUMN_NAME: 'lastModifiedBy' }
      ];
    }

    for (const col of columns) {
      const tableName = col.TABLE_NAME;
      const columnName = col.COLUMN_NAME;
      console.log(`Altering ${tableName}.${columnName} to CHAR(36) with utf8mb4_bin collation...`);
      await queryInterface.sequelize.query(`
        ALTER TABLE \`${tableName}\` 
        MODIFY COLUMN \`${columnName}\` 
        CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL
      `);
    }
  },

  down: async (queryInterface, Sequelize) => {
    const [results] = await queryInterface.sequelize.query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('createdBy', 'updatedBy', 'processedBy', 'employeeId', 'approvedBy', 'authorizedBy', 'deletedBy', 'refundedBy', 'lastModifiedBy')
        AND DATA_TYPE = 'char'
        AND NOT (TABLE_NAME = 'SalePayments' AND COLUMN_NAME = 'processedBy')
        AND NOT (TABLE_NAME = 'SaleRefunds' AND COLUMN_NAME = 'processedBy')
        AND NOT (TABLE_NAME = 'Sales' AND COLUMN_NAME = 'employeeId')
    `);

    let columns = results;
    if (columns.length === 0) {
      console.log('No matching char columns found in query, using fallback list.');
      columns = [
        { TABLE_NAME: 'SaleRefunds', COLUMN_NAME: 'refundedBy' },
        { TABLE_NAME: 'Sales', COLUMN_NAME: 'lastModifiedBy' }
      ];
    }

    for (const col of columns) {
      const tableName = col.TABLE_NAME;
      const columnName = col.COLUMN_NAME;
      console.log(`Reverting ${tableName}.${columnName} to VARCHAR(36) NULL...`);
      await queryInterface.sequelize.query(`
        ALTER TABLE \`${tableName}\` 
        MODIFY COLUMN \`${columnName}\` 
        VARCHAR(36) NULL
      `);
    }
  }
};
