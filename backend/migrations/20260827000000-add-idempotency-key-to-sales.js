'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const salesDesc = await queryInterface.describeTable('Sales');

      if (!salesDesc.idempotencyKey) {
        await queryInterface.addColumn('Sales', 'idempotencyKey', {
          type: Sequelize.STRING(64),
          allowNull: true
        });
        console.log('Added column idempotencyKey to Sales');
      } else {
        console.log('Column idempotencyKey already exists in Sales, skipping addColumn');
      }

      // Enforce uniqueness at the DB level so concurrent/duplicate submissions
      // (e.g. retried offline-queued sales) cannot both succeed. Relying on an
      // app-level findOne-then-create check alone is a race condition.
      const indexes = await queryInterface.showIndex('Sales');
      const hasUniqueIndex = indexes.some(
        (idx) => idx.name === 'sales_idempotency_key_unique'
      );

      if (!hasUniqueIndex) {
        await queryInterface.addIndex('Sales', ['idempotencyKey'], {
          unique: true,
          name: 'sales_idempotency_key_unique'
        });
        console.log('Added unique index sales_idempotency_key_unique on Sales.idempotencyKey');
      } else {
        console.log('Unique index sales_idempotency_key_unique already exists, skipping');
      }
    } catch (err) {
      console.error('Failed executing idempotencyKey migration:', err);
      throw err;
    }
  },

  async down(queryInterface) {
    try {
      const indexes = await queryInterface.showIndex('Sales');
      const hasUniqueIndex = indexes.some(
        (idx) => idx.name === 'sales_idempotency_key_unique'
      );
      if (hasUniqueIndex) {
        await queryInterface.removeIndex('Sales', 'sales_idempotency_key_unique');
      }

      const salesDesc = await queryInterface.describeTable('Sales');
      if (salesDesc.idempotencyKey) {
        await queryInterface.removeColumn('Sales', 'idempotencyKey');
      }
    } catch (err) {
      console.error('Failed reverting idempotencyKey migration:', err);
      throw err;
    }
  }
};
