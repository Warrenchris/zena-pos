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

    console.log('Running column cleanup migration...');
    
    // First drop all existing foreign keys
    const constraints = [
      'SaleItems_ibfk_2',
      'FK_SaleItems_Products',
      'SaleItems_ibfk_54'
    ];

    for (const constraint of constraints) {
      try {
        await sequelize.query(`
          ALTER TABLE SaleItems 
          DROP FOREIGN KEY ${constraint};
        `);
        console.log(`Dropped foreign key: ${constraint}`);
      } catch (err) {
        console.log(`Could not drop constraint ${constraint}:`, err.message);
      }
    }

    // Drop the duplicate column if it exists
    try {
      await sequelize.query(`
        ALTER TABLE SaleItems 
        DROP COLUMN ProductId;
      `);
      console.log('Dropped duplicate ProductId column');
    } catch (err) {
      console.log('Could not drop ProductId column:', err.message);
    }

    // Modify the productId column to use binary UUID
    await sequelize.query(`
      ALTER TABLE SaleItems 
      MODIFY COLUMN productId BINARY(16);
    `);
    console.log('Modified productId column to BINARY(16)');

    // Update data - convert existing UUIDs to binary
    await sequelize.query(`
      UPDATE SaleItems s
      INNER JOIN Products p ON s.productId = p.id
      SET s.productId = UNHEX(REPLACE(p.id, '-', ''))
      WHERE s.productId IS NOT NULL;
    `);
    console.log('Updated product IDs to binary format');

    // Add back foreign key with the correct type
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