'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.addIndex('Customers', ['organizationId', 'active', 'name'], {
        name: 'idx_customers_org_active_name',
        using: 'BTREE'
      });
      console.log('[Migration] Added composite index idx_customers_org_active_name on Customers(organizationId, active, name)');
    } catch (err) {
      if (err.message && (err.message.includes('Duplicate key name') || err.message.includes('already exists'))) {
        console.log('[Migration Notice] Index idx_customers_org_active_name already exists, skipping.');
      } else {
        throw err;
      }
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.removeIndex('Customers', 'idx_customers_org_active_name');
      console.log('[Migration] Removed composite index idx_customers_org_active_name from Customers');
    } catch (err) {
      if (err.message && (err.message.includes("Can't DROP") || err.message.includes("does not exist"))) {
        console.log('[Migration Notice] Index idx_customers_org_active_name does not exist, skipping drop.');
      } else {
        throw err;
      }
    }
  }
};

