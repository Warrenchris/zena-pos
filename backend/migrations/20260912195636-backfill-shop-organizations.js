'use strict';

/**
 * Stage 3 Migration: Backfill Organizations and link to Shops (Option A: Per-shop iteration).
 *
 * Implements Option A (Application Code Iteration):
 * Iterates each Shop individually in Node.js, inserts exactly one corresponding Organization,
 * captures its generated auto-increment id, and immediately updates that specific Shop's
 * organizationId. This guarantees 1:1 relational correctness by construction, avoiding fragile
 * string/name matching.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [shops] = await queryInterface.sequelize.query(
      'SELECT id, name, organizationId FROM `Shops` ORDER BY id ASC'
    );

    for (const shop of shops) {
      if (shop.organizationId) {
        // Verify referenced organization actually exists
        const [orgs] = await queryInterface.sequelize.query(
          'SELECT id FROM `Organizations` WHERE id = ?',
          { replacements: [shop.organizationId] }
        );
        if (orgs.length > 0) {
          continue;
        }
      }

      // Generate unique, URL-safe slug from shop name + shop id
      const cleanName = (shop.name || 'shop')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'shop';
      const slug = `${cleanName}-${shop.id}`;

      await queryInterface.sequelize.query(
        `INSERT INTO \`Organizations\` (\`name\`, \`slug\`, \`status\`, \`currency\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, 'active', 'KES', NOW(), NOW())`,
        { replacements: [shop.name, slug] }
      );

      const [[{ lastId }]] = await queryInterface.sequelize.query(
        'SELECT LAST_INSERT_ID() AS lastId'
      );

      await queryInterface.sequelize.query(
        'UPDATE `Shops` SET `organizationId` = ? WHERE `id` = ?',
        { replacements: [lastId, shop.id] }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('UPDATE `Shops` SET `organizationId` = NULL');
    await queryInterface.sequelize.query('DELETE FROM `Organizations`');
  }
};
