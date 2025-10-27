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
    
    // Drop existing foreign key if it exists
    const [results] = await sequelize.query(`
      SELECT CONSTRAINT_NAME 
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_NAME = 'SaleItems' 
      AND COLUMN_NAME = 'productId' 
      AND REFERENCED_TABLE_NAME = 'Products';
    `);
    
    if (results.length > 0) {
      const constraintName = results[0].CONSTRAINT_NAME;
      await sequelize.query(`
        ALTER TABLE SaleItems 
        DROP FOREIGN KEY ${constraintName};
      `);
      console.log('Dropped existing foreign key constraint');
    }

    // Change the column type to binary UUID
    await sequelize.query(`
      ALTER TABLE SaleItems 
      MODIFY COLUMN productId BINARY(16);
    `);
    console.log('Modified productId column to BINARY(16)');
    
    // Update existing data to convert string UUIDs to binary
    await sequelize.query(`
      UPDATE SaleItems s
      INNER JOIN Products p ON HEX(p.id) = REPLACE(s.productId, '-', '')
      SET s.productId = UNHEX(REPLACE(p.id, '-', ''))
      WHERE s.productId IS NOT NULL;
    `);
    console.log('Updated existing data to binary format');

    // Add back the foreign key constraint
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