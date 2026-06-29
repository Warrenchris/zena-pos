/**
 * Seeding Script for Kenyan-Oriented Sample Data
 * Brand, Names, Products, M-Pesa (Mobile Money) Transactions, KES prices, and Expenses
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { User, Category, Product, Customer, Sale, SaleItem, Expense, Shop, Employee } = require('../src/models');

// Helper to generate M-Pesa Transaction Codes (e.g. QRE5TY46W9)
function generateMpesaCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'R'; // Kenyan transaction codes often start with Q, R, S currently
  for (let i = 0; i < 9; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to generate Invoice Numbers (e.g. INV-202606-0001)
function generateInvoiceNumber(index, date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(index).padStart(4, '0');
  return `INV-${year}${month}-${seq}`;
}

async function seedKenyanData() {
  try {
    console.log('Starting Kenyan-Oriented Seeding Script...');

    // 1. Create a dedicated Kenyan retail shop
    const [shop] = await Shop.findOrCreate({
      where: { name: 'Soko Safi Supermarket (Westlands)' },
      defaults: {
        address: 'Westlands Commercial Center, Ring Road, Westlands, Nairobi, Kenya',
        phone: '+254711223344',
      }
    });
    console.log(`Using Shop: ${shop.name} (ID: ${shop.id})`);

    // 2. Create Kenyan staff users (if they don't already exist)

    const [adminUser] = await User.findOrCreate({
      where: { email: 'wanjiku@sokosafi.co.ke' },
      defaults: {
        name: 'Wanjiku Kamau',
        password: 'wanjiku123',
        role: 'admin',
        shopId: shop.id
      }
    });

    const [managerUser] = await User.findOrCreate({
      where: { email: 'mwangi@sokosafi.co.ke' },
      defaults: {
        name: 'Mwangi Njoroge',
        password: 'mwangi123',
        role: 'manager',
        shopId: shop.id
      }
    });

    const [cashierUser] = await User.findOrCreate({
      where: { email: 'achieng@sokosafi.co.ke' },
      defaults: {
        name: 'Achieng Otieno',
        password: 'achieng123',
        role: 'cashier',
        shopId: shop.id
      }
    });
    console.log('Staff Users verified/created.');

    // 2b. Create Kenyan Employees for HR listing
    await Employee.destroy({ where: { shopId: shop.id } });
    await Employee.bulkCreate([
      {
        firstName: 'Otieno',
        lastName: 'Omondi',
        email: 'otieno.omondi@sokosafi.co.ke',
        phone: '+254711998877',
        position: 'Supervisor',
        status: 'active',
        hireDate: new Date(),
        salary: 45000.00,
        password: 'otieno123',
        shopId: shop.id
      },
      {
        firstName: 'Grace',
        lastName: 'Mwari',
        email: 'grace.mwari@sokosafi.co.ke',
        phone: '+254722887766',
        position: 'Cashier Manager',
        status: 'active',
        hireDate: new Date(),
        salary: 38000.00,
        password: 'grace123',
        shopId: shop.id
      },
      {
        firstName: 'Mutua',
        lastName: 'Kioko',
        email: 'mutua.kioko@sokosafi.co.ke',
        phone: '+254733776655',
        position: 'Packer & Clerk',
        status: 'active',
        hireDate: new Date(),
        salary: 28000.00,
        password: 'mutua123',
        shopId: shop.id
      }
    ]);
    console.log('Employees seeded.');

    // 3. Create Kenyan categories
    const categoriesData = [
      { name: 'Unga & Cereals', description: 'Flour, rice, grains, and staple foods' },
      { name: 'Vinywaji (Beverages)', description: 'Teas, sodas, juices, and local beers' },
      { name: 'Bidhaa za Nyumbani (Household)', description: 'Soaps, detergents, and cleaning items' },
      { name: 'Afya na Urembo (Health/Beauty)', description: 'Skin care, soaps, and hygiene products' },
      { name: 'Vitafunio (Snacks & Bakery)', description: 'Bread, mandazi, and cakes' }
    ];

    const categories = [];
    for (const cat of categoriesData) {
      const [category] = await Category.findOrCreate({
        where: { name: cat.name, shopId: shop.id },
        defaults: {
          description: cat.description
        }
      });
      categories.push(category);
    }
    console.log('Categories verified/created.');

    // 4. Create Kenyan oriented products (Prices in KES)
    const productsData = [
      // Unga & Cereals
      { name: 'Jogoo Maize Meal 2kg', sku: 'UNG001', barcode: '600110011001', price: 180.00, cost: 140.00, stockQuantity: 150, categoryId: categories[0].id },
      { name: 'Kabras Sugar 2kg', sku: 'UNG002', barcode: '600110011002', price: 410.00, cost: 320.00, stockQuantity: 80, categoryId: categories[0].id },
      { name: 'Auntie Pinky Basmati Rice 5kg', sku: 'UNG003', barcode: '600110011003', price: 1250.00, cost: 950.00, stockQuantity: 40, categoryId: categories[0].id },
      // Beverages
      { name: 'Ketepa Pride Tea Leaves 250g', sku: 'BEV001', barcode: '600110012001', price: 160.00, cost: 120.00, stockQuantity: 120, categoryId: categories[1].id },
      { name: 'Tusker Lager Can 500ml', sku: 'BEV002', barcode: '600110012002', price: 230.00, cost: 180.00, stockQuantity: 240, categoryId: categories[1].id },
      { name: 'Safari Lager Beer 500ml', sku: 'BEV003', barcode: '600110012003', price: 220.00, cost: 170.00, stockQuantity: 180, categoryId: categories[1].id },
      { name: 'Coca-Cola Soda 1.25L', sku: 'BEV004', barcode: '600110012004', price: 110.00, cost: 85.00, stockQuantity: 100, categoryId: categories[1].id },
      // Household
      { name: 'Omo Extra Fresh Powder 1kg', sku: 'HOU001', barcode: '600110013001', price: 380.00, cost: 290.00, stockQuantity: 60, categoryId: categories[2].id },
      { name: 'Sunshine Dishwashing Paste 400g', sku: 'HOU002', barcode: '600110013002', price: 140.00, cost: 105.00, stockQuantity: 90, categoryId: categories[2].id },
      // Health & Beauty
      { name: 'Geisha Aloe Vera Soap 200g', sku: 'HLT001', barcode: '600110014001', price: 115.00, cost: 85.00, stockQuantity: 130, categoryId: categories[3].id },
      { name: 'Dettol Soap Original 175g', sku: 'HLT002', barcode: '600110014002', price: 145.00, cost: 110.00, stockQuantity: 100, categoryId: categories[3].id },
      // Snacks & Bakery
      { name: 'Brookside Dairy Fresh Milk 500ml', sku: 'BAK001', barcode: '600110015001', price: 65.00, cost: 48.00, stockQuantity: 200, categoryId: categories[4].id },
      { name: 'Broadways Premium Bread 400g', sku: 'BAK002', barcode: '600110015002', price: 60.00, cost: 46.00, stockQuantity: 150, categoryId: categories[4].id }
    ];

    const products = [];
    for (const prod of productsData) {
      const [product] = await Product.findOrCreate({
        where: { sku: prod.sku, shopId: shop.id },
        defaults: {
          name: prod.name,
          barcode: prod.barcode,
          description: `Authentic Kenyan ${prod.name}`,
          price: prod.price,
          cost: prod.cost,
          stockQuantity: prod.stockQuantity,
          reorderPoint: 10,
          categoryId: prod.categoryId
        }
      });
      products.push(product);
    }
    console.log('Products verified/created.');

    // 5. Create Kenyan Customers
    const customersData = [
      { name: 'Nekesa Wafula', email: 'nekesa.wafula@gmail.com', phone: '+254712345678', address: 'Westlands, Nairobi', loyaltyPoints: 240 },
      { name: 'Kipchirchir Sang', email: 'kipsang@yahoo.com', phone: '+254722987654', address: 'Elgon View, Eldoret', loyaltyPoints: 180 },
      { name: 'Mwikali Mutua', email: 'mwikali.mutua@outlook.com', phone: '+254733111222', address: 'Koma Hill, Machakos', loyaltyPoints: 95 },
      { name: 'Juma Omwamba', email: 'juma.omwamba@gmail.com', phone: '+254701222333', address: 'Milimani, Kisumu', loyaltyPoints: 150 }
    ];

    const customers = [];
    for (const cust of customersData) {
      const [customer] = await Customer.findOrCreate({
        where: { phone: cust.phone, shopId: shop.id },
        defaults: {
          name: cust.name,
          email: cust.email,
          address: cust.address,
          loyaltyPoints: cust.loyaltyPoints
        }
      });
      customers.push(customer);
    }
    console.log('Customers verified/created.');

    // 6. Generate Historical Sales (distributed over the last 30 days)
    console.log('Cleaning up old sales and expenses for this shop to prevent duplicate key errors...');
    await User.sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');
    const oldSales = await Sale.findAll({ where: { shopId: shop.id } });
    const oldSaleIds = oldSales.map(s => s.id);
    if (oldSaleIds.length > 0) {
      await SaleItem.destroy({ where: { saleId: oldSaleIds } });
      await Sale.destroy({ where: { id: oldSaleIds } });
    }
    await Expense.destroy({ where: { shopId: shop.id } });

    console.log('Generating 30 historical sales with M-Pesa & Cash payments...');

    const totalSalesToCreate = 30;
    const now = new Date();

    for (let i = 1; i <= totalSalesToCreate; i++) {
      // Calculate a date in the past 30 days
      const saleDate = new Date();
      saleDate.setDate(now.getDate() - (totalSalesToCreate - i));
      saleDate.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), 0, 0);

      // Select random customer or guest
      const hasCustomer = Math.random() > 0.3;
      const customer = hasCustomer ? customers[Math.floor(Math.random() * customers.length)] : null;

      // Select 1 to 4 random products
      const itemsCount = 1 + Math.floor(Math.random() * 4);
      const selectedProducts = [];
      const usedProductIndexes = new Set();

      while (selectedProducts.length < itemsCount) {
        const prodIdx = Math.floor(Math.random() * products.length);
        if (!usedProductIndexes.has(prodIdx)) {
          usedProductIndexes.add(prodIdx);
          selectedProducts.push(products[prodIdx]);
        }
      }

      // Prepare sale items
      let subtotal = 0;
      const saleItemsToCreate = [];

      for (const prod of selectedProducts) {
        const qty = 1 + Math.floor(Math.random() * 3);
        const itemSubtotal = Number(prod.price) * qty;
        subtotal += itemSubtotal;

        saleItemsToCreate.push({
          productId: prod.id,
          quantity: qty,
          originalPrice: prod.price,
          unitPrice: prod.price,
          price: prod.price,
          subtotal: itemSubtotal,
          shopId: shop.id,
          discount: 0,
          taxRate: 16.00,
          taxAmount: itemSubtotal * 0.16
        });
      }

      // Math for final sale
      const tax = subtotal * 0.16;
      const discount = Math.random() > 0.8 ? 50.00 : 0.00;
      const total = subtotal + tax - discount;

      // Payment method: 60% Mobile Money (M-Pesa), 30% Cash, 10% Card
      const randPay = Math.random();
      let paymentMethod = 'mobile_money';
      let paymentProvider = 'M-PESA';
      let paymentReference = generateMpesaCode();

      if (randPay > 0.6 && randPay <= 0.9) {
        paymentMethod = 'cash';
        paymentProvider = null;
        paymentReference = null;
      } else if (randPay > 0.9) {
        paymentMethod = 'card';
        paymentProvider = 'Equity Bank/Visa';
        paymentReference = `CARD-TXN-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      // Create Sale record
      const invoiceNumber = generateInvoiceNumber(i, saleDate);
      const sale = await Sale.create({
        invoiceNumber,
        subtotal,
        tax,
        taxRate: 16.00,
        discount,
        total,
        paymentMethod,
        paymentAmount: total,
        change: 0,
        paymentReference,
        paymentProvider,
        paymentNotes: paymentMethod === 'mobile_money' ? 'Paid via Safaricom M-Pesa' : 'Paid at POS counter',
        customerName: customer ? customer.name : 'Guest Customer',
        customerLocation: customer ? customer.address : 'Nairobi',
        customerPhone: customer ? customer.phone : null,
        customerEmail: customer ? customer.email : null,
        shopId: shop.id,
        userId: cashierUser.id,
        customerId: customer ? customer.id : null,
        saleStatus: 'completed',
        fulfillmentStatus: 'collected',
        processedAt: saleDate,
        completedAt: saleDate,
        createdAt: saleDate,
        updatedAt: saleDate
      });

      // Add SaleItems
      for (const item of saleItemsToCreate) {
        await SaleItem.create({
          ...item,
          saleId: sale.id
        });
      }
    }
    console.log('Seeded 30 transactions successfully.');

    // 7. Generate Kenyan Oriented Expenses
    console.log('Generating sample expenses for local utility/permit payments...');
    const expensesData = [
      {
        description: 'KPLC Electricity Tokens',
        amount: 4500.00,
        category: 'utilities',
        paymentMethod: 'mobile_money',
        reference: 'MPESA-PAY-KPLC2026',
        daysAgo: 25
      },
      {
        description: 'Nairobi Water and Sewerage Co. Water Bill',
        amount: 1400.00,
        category: 'utilities',
        paymentMethod: 'mobile_money',
        reference: 'MPESA-PAY-NW2026',
        daysAgo: 18
      },
      {
        description: 'Westlands Shop Rent Payment (Landlord)',
        amount: 55000.00,
        category: 'rent',
        paymentMethod: 'bank_transfer',
        reference: 'EQ-TRSF-RENT-JUN',
        daysAgo: 15
      },
      {
        description: 'Nairobi City County Single Business Permit Renewal (Kanjo)',
        amount: 15000.00,
        category: 'other',
        paymentMethod: 'mobile_money',
        reference: 'NCC-BP-202606',
        daysAgo: 12
      },
      {
        description: 'Casual Wages - Goods Loaders (4 persons)',
        amount: 3200.00,
        category: 'salary',
        paymentMethod: 'cash',
        reference: 'CASH-WAGES-LOADERS',
        daysAgo: 5
      }
    ];

    for (const exp of expensesData) {
      const expDate = new Date();
      expDate.setDate(now.getDate() - exp.daysAgo);

      await Expense.create({
        description: exp.description,
        amount: exp.amount,
        category: exp.category,
        date: expDate,
        paymentMethod: exp.paymentMethod,
        reference: exp.reference,
        userId: adminUser.id,
        shopId: shop.id,
        createdAt: expDate,
        updatedAt: expDate
      });
    }
    console.log('Expenses seeded successfully.');

    await User.sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');

    console.log('\n=============================================');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
    console.log('All sample data has been injected in Kenyan KES context.');
    console.log('=============================================');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during seeding script execution:', error);
    process.exit(1);
  }
}

// Run the script
seedKenyanData();
