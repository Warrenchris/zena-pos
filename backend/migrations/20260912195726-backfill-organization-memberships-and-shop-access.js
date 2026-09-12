'use strict';

const crypto = require('crypto');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Backfill Users -> OrganizationMemberships + ShopAccess
    const [users] = await queryInterface.sequelize.query(`
      SELECT u.id, u.role, u.shopId, s.organizationId
      FROM \`Users\` u
      JOIN \`Shops\` s ON s.id = u.shopId
      WHERE s.organizationId IS NOT NULL
      ORDER BY u.id ASC
    `);

    for (const u of users) {
      const orgRole = u.role === 'admin' ? 'owner' : (u.role === 'manager' ? 'admin' : 'member');

      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM `OrganizationMemberships` WHERE organizationId = ? AND userId = ?',
        { replacements: [u.organizationId, u.id] }
      );

      let membershipId;
      if (existing.length > 0) {
        membershipId = existing[0].id;
      } else {
        membershipId = crypto.randomUUID();
        await queryInterface.sequelize.query(
          `INSERT INTO \`OrganizationMemberships\` 
           (\`id\`, \`organizationId\`, \`userId\`, \`employeeId\`, \`orgRole\`, \`status\`, \`createdAt\`, \`updatedAt\`)
           VALUES (?, ?, ?, NULL, ?, 'active', NOW(), NOW())`,
          { replacements: [membershipId, u.organizationId, u.id, orgRole] }
        );
      }

      const [existingAccess] = await queryInterface.sequelize.query(
        'SELECT id FROM `ShopAccess` WHERE membershipId = ? AND shopId = ?',
        { replacements: [membershipId, u.shopId] }
      );

      if (existingAccess.length === 0) {
        const accessId = crypto.randomUUID();
        await queryInterface.sequelize.query(
          `INSERT INTO \`ShopAccess\` (\`id\`, \`membershipId\`, \`shopId\`, \`isDefault\`, \`createdAt\`, \`updatedAt\`)
           VALUES (?, ?, ?, 1, NOW(), NOW())`,
          { replacements: [accessId, membershipId, u.shopId] }
        );
      }
    }

    // 2. Backfill Employees -> OrganizationMemberships + ShopAccess
    const [employees] = await queryInterface.sequelize.query(`
      SELECT e.id, e.shopId, s.organizationId
      FROM \`Employees\` e
      JOIN \`Shops\` s ON s.id = e.shopId
      WHERE s.organizationId IS NOT NULL
      ORDER BY e.id ASC
    `);

    for (const e of employees) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM `OrganizationMemberships` WHERE organizationId = ? AND employeeId = ?',
        { replacements: [e.organizationId, e.id] }
      );

      let membershipId;
      if (existing.length > 0) {
        membershipId = existing[0].id;
      } else {
        membershipId = crypto.randomUUID();
        await queryInterface.sequelize.query(
          `INSERT INTO \`OrganizationMemberships\` 
           (\`id\`, \`organizationId\`, \`userId\`, \`employeeId\`, \`orgRole\`, \`status\`, \`createdAt\`, \`updatedAt\`)
           VALUES (?, ?, NULL, ?, 'member', 'active', NOW(), NOW())`,
          { replacements: [membershipId, e.organizationId, e.id] }
        );
      }

      const [existingAccess] = await queryInterface.sequelize.query(
        'SELECT id FROM `ShopAccess` WHERE membershipId = ? AND shopId = ?',
        { replacements: [membershipId, e.shopId] }
      );

      if (existingAccess.length === 0) {
        const accessId = crypto.randomUUID();
        await queryInterface.sequelize.query(
          `INSERT INTO \`ShopAccess\` (\`id\`, \`membershipId\`, \`shopId\`, \`isDefault\`, \`createdAt\`, \`updatedAt\`)
           VALUES (?, ?, ?, 1, NOW(), NOW())`,
          { replacements: [accessId, membershipId, e.shopId] }
        );
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DELETE FROM `ShopAccess`');
    await queryInterface.sequelize.query('DELETE FROM `OrganizationMemberships`');
  }
};
