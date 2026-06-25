'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Modify column performedByEmployee on ActivityLogs to match Employees.id type
    await queryInterface.sequelize.query(`
      ALTER TABLE ActivityLogs 
      MODIFY COLUMN performedByEmployee char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
    `);

    // Modify column processedBy on SalePayments to match Employees.id type
    await queryInterface.sequelize.query(`
      ALTER TABLE SalePayments 
      MODIFY COLUMN processedBy char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Revert to varchar(36)
    await queryInterface.sequelize.query(`
      ALTER TABLE ActivityLogs 
      MODIFY COLUMN performedByEmployee varchar(36) DEFAULT NULL
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE SalePayments 
      MODIFY COLUMN processedBy varchar(36) DEFAULT NULL
    `);
  }
};
