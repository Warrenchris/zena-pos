'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('PendingPayments', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      checkoutRequestId: {
        type: Sequelize.STRING(200),
        allowNull: false,
        unique: true,
      },
      orderId: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'confirmed', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      paymentChannel: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      saleData: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      shopId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Shops',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      }
    }, { engine: 'InnoDB' });

    await queryInterface.addIndex('PendingPayments', ['checkoutRequestId']);
    await queryInterface.addIndex('PendingPayments', ['orderId']);
    await queryInterface.addIndex('PendingPayments', ['status']);
    await queryInterface.addIndex('PendingPayments', ['shopId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('PendingPayments');
  }
};
