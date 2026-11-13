'use strict';

const PURCHASE_ORDER_FK = 'purchases_purchase_order_id_fk';
const PURCHASE_ORDER_INDEX = 'purchases_purchase_order_id_idx';
const BACKFILL_SQL = `UPDATE Purchases AS p
INNER JOIN PurchaseOrders AS po
  ON po.shopId = p.shopId
  AND p.notes IN (
    CONCAT('Generated from PO ', po.poNumber, ' (RECEIVED)'),
    CONCAT('Generated from PO ', po.poNumber, ' (PARTIALLY_RECEIVED)')
  )
SET p.purchaseOrderId = po.id
WHERE p.purchaseOrderId IS NULL`;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const purchaseColumns = await queryInterface.describeTable('Purchases');
    if (!hasOwn(purchaseColumns, 'purchaseOrderId')) {
      await queryInterface.addColumn('Purchases', 'purchaseOrderId', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }

    const constraints = await queryInterface.showConstraint('Purchases');
    if (!constraints.some((constraint) => constraint.constraintName === PURCHASE_ORDER_FK)) {
      await queryInterface.addConstraint('Purchases', {
        fields: ['purchaseOrderId'],
        type: 'foreign key',
        name: PURCHASE_ORDER_FK,
        references: {
          table: 'PurchaseOrders',
          field: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      });
    }

    const indexes = await queryInterface.showIndex('Purchases');
    if (!indexes.some((index) => index.name === PURCHASE_ORDER_INDEX)) {
      await queryInterface.addIndex('Purchases', ['purchaseOrderId'], {
        name: PURCHASE_ORDER_INDEX
      });
    }

    await queryInterface.sequelize.query(BACKFILL_SQL);
  },

  down: async (queryInterface) => {
    const purchaseColumns = await queryInterface.describeTable('Purchases');
    if (!hasOwn(purchaseColumns, 'purchaseOrderId')) {
      return;
    }

    const constraints = await queryInterface.showConstraint('Purchases');
    if (constraints.some((constraint) => constraint.constraintName === PURCHASE_ORDER_FK)) {
      await queryInterface.removeConstraint('Purchases', PURCHASE_ORDER_FK);
    }

    const indexes = await queryInterface.showIndex('Purchases');
    if (indexes.some((index) => index.name === PURCHASE_ORDER_INDEX)) {
      await queryInterface.removeIndex('Purchases', PURCHASE_ORDER_INDEX);
    }

    await queryInterface.removeColumn('Purchases', 'purchaseOrderId');
  }
};
