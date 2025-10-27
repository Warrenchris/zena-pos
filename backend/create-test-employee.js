require('dotenv').config();
const { Sequelize } = require('sequelize');
const Employee = require('./src/models/Employee');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: console.log
  }
);

async function createTestEmployee() {
  try {
    const employee = await Employee.create({
      id: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Test',
      lastName: 'Employee',
      email: 'test.employee@example.com',
      position: 'cashier',
      active: true,
      shopId: 1,
      password: 'password123',
      salary: 50000.00
    });

    console.log('Created test employee:', employee.toJSON());
  } catch (error) {
    console.error('Failed to create test employee:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

createTestEmployee()
  .catch(err => {
    console.error('Failed to run test:', err);
    process.exit(1);
  });