'use strict';

const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create default shop
    await queryInterface.bulkInsert('Shops', [{
      name: 'Demo Shop',
      address: '123 Main St',
      phone: '254-700-000000',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }], { returning: true });

    // Create some categories
    const categories = await queryInterface.bulkInsert('Categories', [
      {
        name: 'Electronics',
        description: 'Electronic devices and accessories',
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Food & Beverages',
        description: 'Food and drink items',
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Groceries',
        description: 'Food and household items',
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Stationery',
        description: 'Office and school supplies',
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], { returning: true });

    // Create some products
    await queryInterface.bulkInsert('Products', [
      {
        name: 'Smartphone',
        description: 'Latest model smartphone',
        price: 599.99,
        quantity: 50,
        categoryId: 1,
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Laptop',
        description: 'High-performance laptop',
        price: 999.99,
        quantity: 25,
        categoryId: 1,
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    // Create test users for each role
    await queryInterface.bulkInsert('Users', [
      {
        name: 'System Admin',
        email: 'admin@example.com',
        password: await bcrypt.hash('admin123', 8),
        role: 'admin',
        shopId: 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Test Manager',
        email: 'manager@example.com',
        password: await bcrypt.hash('manager123', 8),
        role: 'manager',
        shopId: 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Test Cashier',
        email: 'cashier@example.com',
        password: await bcrypt.hash('cashier123', 8),
        role: 'cashier',
        shopId: 1,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    // Create some customers
    await queryInterface.bulkInsert('Customers', [
      {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '254-700-111111',
        address: '456 Oak St',
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '254-700-222222',
        address: '789 Pine St',
        shopId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Customers', null, {});
    await queryInterface.bulkDelete('Products', null, {});
    await queryInterface.bulkDelete('Categories', null, {});
    await queryInterface.bulkDelete('Shops', null, {});
  }
};