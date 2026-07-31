const path = require('path');
require('./backend/node_modules/dotenv').config({ path: path.join(__dirname, 'backend/.env') });
const { sequelize, Purchase, PurchaseOrder, Product } = require('./backend/src/models');

async function testPurchasesAndOrders() {
  console.log('🧪 Starting Purchases & Purchase Orders Integration Test...');

  try {
    // 1. Authenticate and sync database models
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');
    await Purchase.sync();
    await PurchaseOrder.sync();
    await Product.sync();
    console.log('✅ Database models synchronized.');

    // 2. Ensure test product exists
    let [product] = await Product.findOrCreate({
      where: { sku: 'TEST-PURCH-SKU-001' },
      defaults: {
        name: 'Test Purchase Energy Drink 500ml',
        price: 150.00,
        cost: 100.00,
        stockQuantity: 10,
        reorderPoint: 5,
        categoryId: 1
      }
    });

    const initialStock = product.stockQuantity;
    console.log(`📦 Initial Product Stock for SKU ${product.sku}: ${initialStock}`);

    // 3. Test Purchase Creation & Auto Stock Increase
    console.log('📝 Creating test Purchase record (Status: RECEIVED, Qty: 25)...');
    const testPurchase = await Purchase.create({
      referenceNo: `TEST-PUR-${Date.now()}`,
      supplierName: 'Test Apex Wholesalers',
      supplierContact: '+254799000111',
      purchaseDate: new Date(),
      status: 'RECEIVED',
      paymentStatus: 'PAID',
      paymentMethod: 'M-PESA',
      totalAmount: 2500.00,
      notes: 'Automated test purchase receipt',
      items: [
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: 25,
          unitCost: 100.00,
          totalCost: 2500.00
        }
      ]
    });

    // Auto-increment stock
    await product.increment('stockQuantity', { by: 25 });
    await product.reload();

    console.log(`✅ Purchase ${testPurchase.referenceNo} created successfully.`);
    console.log(`📦 Updated Product Stock after Purchase: ${product.stockQuantity} (Expected: ${initialStock + 25})`);
    if (product.stockQuantity !== initialStock + 25) {
      throw new Error(`Stock mismatch after purchase! Got ${product.stockQuantity}, expected ${initialStock + 25}`);
    }

    // 4. Test Purchase Order Creation & Receiving Flow
    console.log('📋 Creating test Purchase Order (Status: ORDERED, Qty: 50)...');
    const testPo = await PurchaseOrder.create({
      poNumber: `TEST-PO-${Date.now()}`,
      supplierName: 'Test Apex Wholesalers',
      supplierEmail: 'test@apexwholesalers.co.ke',
      supplierPhone: '+254799000111',
      orderDate: new Date(),
      expectedDeliveryDate: new Date(Date.now() + 86400000 * 2),
      status: 'ORDERED',
      totalAmount: 5000.00,
      notes: 'Automated test PO',
      items: [
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantityOrdered: 50,
          quantityReceived: 0,
          unitCost: 100.00,
          subtotal: 5000.00
        }
      ]
    });

    console.log(`✅ PO ${testPo.poNumber} created with status '${testPo.status}'.`);

    // 5. Test Receiving PO -> Converts to Purchase & Increments Stock
    console.log(`🚚 Receiving PO ${testPo.poNumber} (Transitioning status to RECEIVED)...`);
    testPo.status = 'RECEIVED';
    testPo.items = testPo.items.map(i => ({ ...i, quantityReceived: i.quantityOrdered }));
    await testPo.save();

    // Create linked Purchase record
    const linkedPurchase = await Purchase.create({
      referenceNo: `PUR-${testPo.poNumber.replace('TEST-PO-', '')}`,
      supplierName: testPo.supplierName,
      supplierContact: testPo.supplierPhone,
      purchaseDate: new Date(),
      status: 'RECEIVED',
      paymentStatus: 'PAID',
      paymentMethod: 'BANK TRANSFER',
      totalAmount: testPo.totalAmount,
      notes: `Generated from ${testPo.poNumber}`,
      items: testPo.items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantityOrdered,
        unitCost: i.unitCost,
        totalCost: i.subtotal
      }))
    });

    await product.increment('stockQuantity', { by: 50 });
    await product.reload();

    console.log(`✅ Linked Purchase ${linkedPurchase.referenceNo} generated.`);
    console.log(`📦 Final Product Stock after receiving PO: ${product.stockQuantity} (Expected: ${initialStock + 25 + 50})`);

    if (product.stockQuantity !== initialStock + 25 + 50) {
      throw new Error(`Stock mismatch after PO receiving! Got ${product.stockQuantity}, expected ${initialStock + 25 + 50}`);
    }

    // 6. Cleanup test records
    await testPurchase.destroy();
    await linkedPurchase.destroy();
    await testPo.destroy();
    await product.destroy();
    console.log('🧹 Cleaned up temporary test records.');

    console.log('\n🎉 ALL PURCHASES & PURCHASE ORDERS TESTS PASSED SUCCESSFULLY! 🚀\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

testPurchasesAndOrders();
