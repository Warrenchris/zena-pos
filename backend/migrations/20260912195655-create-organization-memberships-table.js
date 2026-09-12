'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [tables] = await queryInterface.sequelize.query(
      "SHOW TABLES LIKE 'OrganizationMemberships'"
    );
    if (tables.length > 0) {
      return;
    }

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`OrganizationMemberships\` (
        \`id\` CHAR(36) COLLATE utf8mb4_bin NOT NULL,
        \`organizationId\` INT NOT NULL,
        \`userId\` INT NULL,
        \`employeeId\` CHAR(36) COLLATE utf8mb4_bin NULL,
        \`orgRole\` ENUM('owner', 'admin', 'member', 'billing_admin') NOT NULL DEFAULT 'member',
        \`status\` ENUM('active', 'invited', 'suspended') NOT NULL DEFAULT 'active',
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`fk_org_memberships_org\` FOREIGN KEY (\`organizationId\`) REFERENCES \`Organizations\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_org_memberships_user\` FOREIGN KEY (\`userId\`) REFERENCES \`Users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_org_memberships_employee\` FOREIGN KEY (\`employeeId\`) REFERENCES \`Employees\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`chk_org_memberships_identity\` CHECK ((\`userId\` IS NOT NULL AND \`employeeId\` IS NULL) OR (\`userId\` IS NULL AND \`employeeId\` IS NOT NULL)),
        UNIQUE KEY \`uq_org_membership_user\` (\`organizationId\`, \`userId\`),
        UNIQUE KEY \`uq_org_membership_employee\` (\`organizationId\`, \`employeeId\`),
        KEY \`idx_org_membership_org_role\` (\`organizationId\`, \`orgRole\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('OrganizationMemberships');
  }
};
