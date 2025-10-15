/* eslint-env node */
const { Sequelize } = require('sequelize');
const config = require('../config/config.json');
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

async function fixDuplicateUserIdColumns() {
  const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: console.log,
  });

  try {
    // Check if both UserId and userId exist
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = ? 
      AND table_name = 'Sales' 
      AND column_name IN ('UserId', 'userId')
    `, {
      replacements: [dbConfig.database],
      type: Sequelize.QueryTypes.SELECT
    });

    // Get all columns from Sales table
    const [columns] = await sequelize.query(`
      SHOW COLUMNS FROM Sales
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log('Current columns:', columns);

    if (results && results.length > 1) {
      // Both columns exist, need to merge them
      await sequelize.transaction(async (t) => {
        // First, copy any data from UserId to userId where userId is null
        await sequelize.query(`
          UPDATE Sales 
          SET userId = UserId 
          WHERE userId IS NULL AND UserId IS NOT NULL
        `, { transaction: t });

        // Then remove the duplicate UserId column
        await sequelize.query(`
          ALTER TABLE Sales DROP COLUMN UserId
        `, { transaction: t });

        console.log('Successfully merged UserId into userId and dropped the duplicate column');
      });
    }

    // Similarly for CustomerId
    const [customerResults] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = ? 
      AND table_name = 'Sales' 
      AND column_name IN ('CustomerId', 'customerId')
    `, {
      replacements: [dbConfig.database],
      type: Sequelize.QueryTypes.SELECT
    });

    if (customerResults && customerResults.length > 1) {
      await sequelize.transaction(async (t) => {
        // Copy data from CustomerId to customerId where customerId is null
        await sequelize.query(`
          UPDATE Sales 
          SET customerId = CustomerId 
          WHERE customerId IS NULL AND CustomerId IS NOT NULL
        `, { transaction: t });

        // Remove the duplicate CustomerId column
        await sequelize.query(`
          ALTER TABLE Sales DROP COLUMN CustomerId
        `, { transaction: t });

        console.log('Successfully merged CustomerId into customerId and dropped the duplicate column');
      });
    }

    await sequelize.close();
    console.log('Database connection closed');

  } catch (error) {
    console.error('Error:', error);
    await sequelize.close();
    process.exit(1);
  }
}

fixDuplicateUserIdColumns().catch(console.error);