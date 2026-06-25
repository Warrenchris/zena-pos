'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.changeColumn('Sales', 'employeeId', {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'Employees', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL'
      });
    } catch (err) {
      console.log('changeColumn Sales.employeeId skipped:', err.message);
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      await queryInterface.changeColumn('Sales', 'employeeId', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'Employees', key: 'id' }
      });
    } catch (err) {
      console.log('changeColumn Sales.employeeId down skipped:', err.message);
    }
  }
};