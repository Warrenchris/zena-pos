const { Sequelize } = require('sequelize');
const path = require('path');

// Import migrations
const addCustomerAndEmployeeToSales = require('../migrations/20250121_add_customer_and_employee_to_sales');
const addLocationToCustomers = require('../migrations/20250121_add_location_to_customers');

const config = require('../config/config.json').development;
const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  logging: false
});

async function runMigrations() {
  try {
    console.log('🔄 Running sales-related migrations...');
    
    // Run migrations
    await addCustomerAndEmployeeToSales.up(sequelize.getQueryInterface(), Sequelize);
    console.log('✅ Added customer and employee fields to Sales table');
    
    await addLocationToCustomers.up(sequelize.getQueryInterface(), Sequelize);
    console.log('✅ Added location field to Customers table');
    
    console.log('🎉 All migrations completed successfully!');
    
    await sequelize.close();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
