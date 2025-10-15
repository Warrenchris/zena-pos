// Fix employee ID handling in sales table
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Modify employeeId column to match Employee model's UUID type
    await queryInterface.changeColumn('Sales', 'employeeId', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'Employees',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert the column type back
    await queryInterface.changeColumn('Sales', 'employeeId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Employees',
        key: 'id'
      }
    });
  }
};