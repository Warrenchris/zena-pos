const { Sequelize } = require('sequelize');
const config = require('../config/config.json');
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  dialect: dbConfig.dialect
});

async function checkProducts() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');

    const [products] = await sequelize.query(`
      SELECT p.id, p.name, p.sku, p.stockQuantity, p.price, c.name as category
      FROM Products p
      JOIN Categories c ON p.CategoryId = c.id
      WHERE p.active = true 
      AND p.shopId = 3
      ORDER BY p.stockQuantity DESC;
    `);

    console.log('\nAvailable Products in Shop 3:');
    console.table(products);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkProducts();