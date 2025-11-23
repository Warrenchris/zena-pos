const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend', '.env') });

// Setup Sequelize
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false
    }
);

async function checkData() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const shopId = 3;
        const employeeId = '871bafd5-5369-4608-8dae-8cb0af7966a8';

        // Check Products
        const [products] = await sequelize.query(
            `SELECT count(*) as count FROM Products WHERE shopId = ${shopId} AND active = true`
        );
        console.log(`Active Products for Shop ${shopId}:`, products[0].count);

        // Check Sales for Employee
        const [sales] = await sequelize.query(
            `SELECT count(*) as count, sum(total) as total FROM Sales WHERE shopId = ${shopId} AND employeeId = '${employeeId}'`
        );
        console.log(`Sales for Employee ${employeeId}:`, sales[0]);

        // Check Sales for User (in case of ID mismatch)
        // We don't know the User ID corresponding to this Employee ID easily without querying Employees/Users table
        // But let's check ALL sales for the shop
        const [allSales] = await sequelize.query(
            `SELECT count(*) as count FROM Sales WHERE shopId = ${shopId}`
        );
        console.log(`Total Sales for Shop ${shopId}:`, allSales[0].count);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkData();
