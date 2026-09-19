require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      connectTimeout: 60000
    }
  }
);

async function inspectTable() {
  try {
    console.log('Testing database connection...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    console.log('Inspecting SaleItems table...');
    
    // Get table structure
    const [columns] = await sequelize.query(`
      DESCRIBE SaleItems;
    `);
    console.log('Table structure:', JSON.stringify(columns, null, 2));

  } catch (error) {
    console.error('Inspection failed:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

inspectTable()
  .catch(err => {
    console.error('Failed to inspect table:', err);
    process.exit(1);
  });