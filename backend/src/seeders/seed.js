const bcrypt = require('bcryptjs');
const { User, Category, Product, Customer, Sale, SaleItem, Expense } = require('../models');

const seedDatabase = async () => {
  try {
    // Check if users already exist
    const existingUsers = await User.findAll();
    if (existingUsers.length > 0) {
      console.log('Users already exist, skipping user creation');
      return;
    }

    // Create users
    const users = await User.bulkCreate([
      {
        name: 'Admin User',
        email: 'admin@example.com',
        password: await bcrypt.hash('admin123', 8),
        role: 'admin'
      },
      {
        name: 'Manager User',
        email: 'manager@example.com',
        password: await bcrypt.hash('manager123', 8),
        role: 'manager'
      },
      {
        name: 'Cashier User',
        email: 'cashier@example.com',
        password: await bcrypt.hash('cashier123', 8),
        role: 'cashier'
      }
    ]);

    // Create categories
    const categories = await Category.bulkCreate([
      { name: 'Electronics', description: 'Electronic devices and accessories' },
      { name: 'Clothing', description: 'Apparel and fashion items' },
      { name: 'Groceries', description: 'Food and household items' },
      { name: 'Stationery', description: 'Office and school supplies' }
    ]);

    // Create products
    const products = await Product.bulkCreate([
      {
        name: 'Smartphone',
        sku: 'ELEC001',
        barcode: '1234567890123',
        description: 'Latest model smartphone',
        price: 599.99,
        cost: 400.00,
        stockQuantity: 50,
        CategoryId: categories[0].id
      },
      {
        name: 'Laptop',
        sku: 'ELEC002',
        barcode: '1234567890124',
        description: 'Business laptop',
        price: 999.99,
        cost: 700.00,
        stockQuantity: 30,
        CategoryId: categories[0].id
      },
      {
        name: 'T-Shirt',
        sku: 'CLO001',
        barcode: '2234567890123',
        description: 'Cotton t-shirt',
        price: 19.99,
        cost: 5.00,
        stockQuantity: 100,
        CategoryId: categories[1].id
      },
      {
        name: 'Rice 5kg',
        sku: 'GRO001',
        barcode: '3234567890123',
        description: 'Premium rice 5kg pack',
        price: 15.99,
        cost: 10.00,
        stockQuantity: 200,
        CategoryId: categories[2].id
      },
      {
        name: 'Notebook',
        sku: 'STA001',
        barcode: '4234567890123',
        description: 'Spiral notebook 100 pages',
        price: 4.99,
        cost: 1.50,
        stockQuantity: 300,
        CategoryId: categories[3].id
      }
    ]);

    // Create customers
    const customers = await Customer.bulkCreate([
      {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+254700000001',
        address: 'Nairobi, Kenya',
        loyaltyPoints: 100
      },
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+254700000002',
        address: 'Mombasa, Kenya',
        loyaltyPoints: 50
      },
      {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        phone: '+254700000003',
        address: 'Kisumu, Kenya',
        loyaltyPoints: 75
      }
    ]);

    // Create sample sales
    const sales = await Sale.bulkCreate([
      {
        invoiceNumber: '20250916-0001',
        subtotal: 619.98,
        tax: 62.00,
        discount: 10.00,
        total: 671.98,
        paymentMethod: 'card',
        paymentStatus: 'completed',
        userId: users[2].id,
        customerId: customers[0].id
      },
      {
        invoiceNumber: '20250916-0002',
        subtotal: 35.98,
        tax: 3.60,
        discount: 0,
        total: 39.58,
        paymentMethod: 'cash',
        paymentStatus: 'completed',
        userId: users[2].id,
        customerId: customers[1].id
      }
    ]);

    // Create sale items
    await SaleItem.bulkCreate([
      {
        saleId: sales[0].id,
        productId: products[0].id,
        quantity: 1,
        unitPrice: 599.99,
        subtotal: 599.99,
        discount: 0
      },
      {
        saleId: sales[0].id,
        productId: products[4].id,
        quantity: 4,
        unitPrice: 4.99,
        subtotal: 19.96,
        discount: 0
      },
      {
        saleId: sales[1].id,
        productId: products[2].id,
        quantity: 1,
        unitPrice: 19.99,
        subtotal: 19.99,
        discount: 0
      },
      {
        saleId: sales[1].id,
        productId: products[4].id,
        quantity: 3,
        unitPrice: 4.99,
        subtotal: 14.97,
        discount: 0
      }
    ]);

    // Create sample expenses
    await Expense.bulkCreate([
      {
        description: 'Monthly Rent',
        amount: 1000.00,
        category: 'rent',
        date: new Date(),
        paymentMethod: 'bank_transfer',
        reference: 'RENT-SEP2025',
        userId: users[0].id
      },
      {
        description: 'Electricity Bill',
        amount: 200.00,
        category: 'utilities',
        date: new Date(),
        paymentMethod: 'mobile_money',
        reference: 'UTIL-SEP2025',
        userId: users[1].id
      },
      {
        description: 'Stock Reorder - Electronics',
        amount: 5000.00,
        category: 'inventory',
        date: new Date(),
        paymentMethod: 'bank_transfer',
        reference: 'INV-SEP2025-01',
        userId: users[1].id
      }
    ]);

    console.log('Seed data created successfully');
    
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
};

module.exports = seedDatabase;
