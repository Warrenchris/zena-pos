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

    console.log('Running column creation migration...');
    
    // Add the productId column as CHAR(36)
    await sequelize.query(`
      ALTER TABLE SaleItems 
      ADD COLUMN productId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
    `);
    console.log('Added productId column');

    // Add the foreign key constraint
    await sequelize.query(`
      ALTER TABLE SaleItems 
      ADD CONSTRAINT FK_SaleItems_Products 
      FOREIGN KEY (productId) 
      REFERENCES Products(id);
    `);
    console.log('Added foreign key constraint');

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