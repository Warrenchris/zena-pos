'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Employees', 'password', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: '$2a$08$rM8rRpY9e7jh0ayR1Y0WCOjR.QQCQiCPHqahy5czxL6HtGRw6EMJC' // Default hashed password: 'password123'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Employees', 'password');
  }
};