'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('stores', [
      {
        name: 'Main Branch',
        address: 'Nairobi CBD',
        phone: '+254 700 000000',
        email: 'main@zanapos.com',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Westlands Store',
        address: 'Westlands Mall',
        phone: '+254 700 000001',
        email: 'westlands@zanapos.com',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Mombasa Branch',
        address: 'Nyali Plaza',
        phone: '+254 700 000002',
        email: 'mombasa@zanapos.com',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('stores', null, {});
  }
};