'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add missing fields to Sales table
    await queryInterface.addColumn('Sales', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true
    }).catch(() => {});

    // Update the discount field in SaleItems if not exists
    await queryInterface.addColumn('SaleItems', 'discount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    }).catch(() => {});

    // Ensure paymentMethod is VARCHAR(50) to support all payment types including split
    try {
      await queryInterface.changeColumn('Sales', 'paymentMethod', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'cash'
      });
    } catch (error) {} // Ignore errors

    // Ensure shopId exists
    await queryInterface.addColumn('Sales', 'shopId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 1
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Sales', 'notes').catch(() => {});
    await queryInterface.removeColumn('SaleItems', 'discount').catch(() => {});
    
    // Don't revert paymentMethod enum or remove shopId as they are critical fields
  }
};