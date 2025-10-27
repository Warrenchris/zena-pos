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

async function inspectAndFixColumn() {
  try {
    console.log('Testing database connection...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    console.log('Inspecting and fixing productId column...');
    
    // First check if column exists
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

    // Handle any existing productId column
    try {
      await sequelize.query(`
        ALTER TABLE SaleItems 
        MODIFY COLUMN productId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
      `);
      console.log('Modified existing productId column');
    } catch (err) {
      if (err.original.code === 'ER_BAD_FIELD_ERROR') {
        // Column doesn't exist, create it
        await sequelize.query(`
          ALTER TABLE SaleItems 
          ADD COLUMN productId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
        `);
        console.log('Added new productId column');
      } else {
        console.error('Error modifying column:', err);
        throw err;
      }
    }

    // Add back foreign key constraint
    await sequelize.query(`
      ALTER TABLE SaleItems 
      ADD CONSTRAINT FK_SaleItems_Products 
      FOREIGN KEY (productId) 
      REFERENCES Products(id);
    `);
    console.log('Added foreign key constraint');

    console.log('Column fix completed successfully!');
  } catch (error) {
    console.error('Fix failed:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

inspectAndFixColumn()
  .catch(err => {
    console.error('Failed to fix column:', err);
    process.exit(1);
  });