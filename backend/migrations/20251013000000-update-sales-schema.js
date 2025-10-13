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

    // Update paymentMethod enum to include 'check'
    try {
      const [results] = await queryInterface.sequelize.query(
        "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_NAME = 'Sales' AND COLUMN_NAME = 'paymentMethod'"
      );
      
      if (!results[0].COLUMN_TYPE.includes('check')) {
        await queryInterface.sequelize.query(
          "ALTER TABLE `Sales` MODIFY COLUMN `paymentMethod` ENUM('cash', 'card', 'mobile', 'mobile_money', 'other', 'check') NOT NULL DEFAULT 'cash'"
        );
      }
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