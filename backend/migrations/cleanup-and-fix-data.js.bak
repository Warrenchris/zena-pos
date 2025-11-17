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

async function cleanupAndFixData() {
  try {
    console.log('Testing database connection...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    console.log('Starting data cleanup and column fix...');
    
    // First check if columns exist
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE, CHARACTER_SET_NAME, COLLATION_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_NAME = 'SaleItems' 
      AND COLUMN_NAME LIKE '%productId%';
    `);
    console.log('Found columns:', JSON.stringify(columns, null, 2));

    // Drop all related foreign keys
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

    // Drop the ProductId column (uppercase) if it exists
    try {
      await sequelize.query(`
        ALTER TABLE SaleItems 
        DROP COLUMN ProductId;
      `);
      console.log('Dropped ProductId column');
    } catch (err) {
      console.log('Could not drop ProductId column:', err.message);
    }

    // Make sure productId is CHAR(36)
    try {
      await sequelize.query(`
        ALTER TABLE SaleItems 
        MODIFY COLUMN productId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
      `);
      console.log('Modified productId column type');
    } catch (err) {
      if (err.original.code === 'ER_BAD_FIELD_ERROR') {
        await sequelize.query(`
          ALTER TABLE SaleItems 
          ADD COLUMN productId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
        `);
        console.log('Added productId column');
      } else {
        console.error('Error modifying column:', err);
        throw err;
      }
    }

    // Get all valid product IDs
    const [validProducts] = await sequelize.query(`
      SELECT id FROM Products;
    `);
    const validIds = validProducts.map(p => `'${p.id}'`).join(',');

    // Check for invalid sale items
    const [invalidItems] = await sequelize.query(`
      SELECT * FROM SaleItems 
      WHERE productId IS NULL 
      OR productId NOT IN (${validIds});
    `);
    console.log('Found invalid sale items:', JSON.stringify(invalidItems, null, 2));

    if (invalidItems.length > 0) {
      // Remove invalid sale items
      await sequelize.query(`
        DELETE FROM SaleItems 
        WHERE productId IS NULL 
        OR productId NOT IN (${validIds});
      `);
      console.log(`Removed ${invalidItems.length} invalid sale items`);
    }

    // Add back foreign key constraint
    await sequelize.query(`
      ALTER TABLE SaleItems 
      ADD CONSTRAINT FK_SaleItems_Products 
      FOREIGN KEY (productId) 
      REFERENCES Products(id);
    `);
    console.log('Added foreign key constraint');

    console.log('Cleanup and fix completed successfully!');
  } catch (error) {
    console.error('Fix failed:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

cleanupAndFixData()
  .catch(err => {
    console.error('Failed to fix data:', err);
    process.exit(1);
  });