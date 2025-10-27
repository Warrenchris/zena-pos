// Test creating a new sale with product
const { Sequelize } = require('sequelize');
const Sale = require('./src/models/Sale');
const SaleItem = require('./src/models/SaleItem');
const Product = require('./src/models/Product');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: 'mysql',
    logging: console.log
  }
);

async function testCreateSale() {
  try {
    // First get a valid product
    const product = await Product.findOne();
    if (!product) {
      throw new Error('No products found to test with');
    }

    console.log('Using product:', product.toJSON());

    // Create a new sale with a unique invoice number
    const timestamp = new Date().getTime();
    const sale = await Sale.create({
      shopId: 1,
      total: product.price,
      subtotal: product.price,
      tax: 0,
      discount: 0,
      paymentMethod: 'cash',
      paymentAmount: product.price,
      change: 0,
      paymentStatus: 'completed',
      customerName: 'Test Customer',
      employeeId: '550e8400-e29b-41d4-a716-446655440000', // Example UUID
      invoiceNumber: `INV-${timestamp}` // Unique invoice number
    });

    console.log('Created sale:', sale.toJSON());

    // Create sale item
    const saleItem = await SaleItem.create({
      saleId: sale.id,
      productId: product.id,
      quantity: 1,
      unitPrice: product.price,
      price: product.price,
      subtotal: product.price,
      discount: 0,
      shopId: 1
    });

    console.log('Created sale item:', saleItem.toJSON());

    // Now fetch the sale with its items
    const savedSale = await Sale.findOne({
      where: { id: sale.id },
      include: [{
        model: SaleItem,
        include: [Product]
      }]
    });

    console.log('Fetched sale with items:', JSON.stringify(savedSale, null, 2));

  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

testCreateSale()
  .catch(err => {
    console.error('Failed to run test:', err);
    process.exit(1);
  });