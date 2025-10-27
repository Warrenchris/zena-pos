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

async function runMigration() {
  try {
    console.log('Testing database connection...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    console.log('Running UUID fix migration...');
    
    // First, let's directly check the foreign key name
    await sequelize.query(`
      SELECT CONSTRAINT_NAME, TABLE_NAME 
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_NAME = 'SaleItems' 
      AND COLUMN_NAME = 'productId' 
      AND REFERENCED_TABLE_NAME = 'Products';
    `).then(([results]) => {
      console.log('Found foreign key constraints:', results);
    });

    // Then let's check the current column type
    await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE 
      FROM information_schema.COLUMNS 
      WHERE TABLE_NAME = 'SaleItems' 
      AND COLUMN_NAME = 'productId';
    `).then(([results]) => {
      console.log('Current column details:', results);
    });

    // Let's try to modify the column without dropping the foreign key first
    await sequelize.query(`
      ALTER TABLE SaleItems 
      MODIFY COLUMN productId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
    `).then(() => {
      console.log('Modified column type successfully');
    });

    await sequelize.query(`
      UPDATE SaleItems s
      INNER JOIN Products p ON s.productId = p.id
      SET s.productId = p.id
      WHERE s.productId IS NOT NULL;
    `).then(() => {
      console.log('Updated product IDs successfully');
    });

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

runMigration()
  .catch(err => {
    console.error('Failed to run migration:', err);
    process.exit(1);
  });