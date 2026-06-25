'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('Sales');

    // Only add customer fields if they don't exist
    if (!tableInfo.customerName) {
      await queryInterface.addColumn('Sales', 'customerName', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.customerLocation) {
      await queryInterface.addColumn('Sales', 'customerLocation', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.customerPhone) {
      await queryInterface.addColumn('Sales', 'customerPhone', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.customerEmail) {
      await queryInterface.addColumn('Sales', 'customerEmail', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    if (!tableInfo.paymentAmount) {
      await queryInterface.addColumn('Sales', 'paymentAmount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      });
    }

    if (!tableInfo.change) {
      await queryInterface.addColumn('Sales', 'change', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
      });
    }

    if (!tableInfo.employeeId) {
      await queryInterface.addColumn('Sales', 'employeeId', {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Employees',
          key: 'id'
        }
      });
    }

    // Update paymentMethod enum to include 'mobile' (only if column exists)
    if (tableInfo.paymentMethod) {
      try {
        await queryInterface.changeColumn('Sales', 'paymentMethod', {
          type: Sequelize.ENUM('cash', 'card', 'mobile', 'mobile_money', 'other'),
          allowNull: true
        });
      } catch (err) {
        console.log('changeColumn Sales.paymentMethod skipped:', err.message);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Sales', 'customerName');
    await queryInterface.removeColumn('Sales', 'customerLocation');
    await queryInterface.removeColumn('Sales', 'customerPhone');
    await queryInterface.removeColumn('Sales', 'customerEmail');
    await queryInterface.removeColumn('Sales', 'paymentAmount');
    await queryInterface.removeColumn('Sales', 'change');
    await queryInterface.removeColumn('Sales', 'employeeId');

    // Revert paymentMethod enum
    await queryInterface.changeColumn('Sales', 'paymentMethod', {
      type: Sequelize.ENUM('cash', 'card', 'mobile_money', 'other'),
      allowNull: false
    });
  }
};
