const bcrypt = require('bcryptjs');
const { User, Shop, Employee } = require('../src/models');

const seedDatabase = async () => {
  try {
    // Create default shop
    const defaultShop = await Shop.create({
      name: 'Demo Shop',
      address: 'Nairobi, Kenya',
      phone: '+254700000000'
    });

    // Create sample employees
    await Employee.bulkCreate([
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '+254711000001',
        position: 'Store Manager',
        status: 'active',
        hireDate: new Date(),
        salary: 50000.00,
        password: await bcrypt.hash('password123', 8),
        shopId: defaultShop.id
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '+254711000002',
        position: 'Sales Associate',
        status: 'active',
        hireDate: new Date(),
        salary: 35000.00,
        password: await bcrypt.hash('password123', 8),
        shopId: defaultShop.id
      },
      {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@example.com',
        phone: '+254711000003',
        position: 'Cashier',
        status: 'active',
        hireDate: new Date(),
        salary: 30000.00,
        password: await bcrypt.hash('password123', 8),
        shopId: defaultShop.id
      }
    ]);

    console.log('Employee seed data created successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
};

module.exports = seedDatabase;