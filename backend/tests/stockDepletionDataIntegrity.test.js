const sequelize = require('../src/config/database');
const {
  Shop,
  Organization,
  Product,
  Inventory,
  Sale,
  SaleItem,
  SaleRefund,
  SalePayment,
  StockMovement,
  ActivityLog,
  User,
  Plan,
  Subscription
} = require('../src/models');
const insightsController = require('../src/controllers/insightsController');
const { buildNetDemandQuery } = insightsController;
const saleController = require('../src/controllers/saleController');

describe('Phase 2B: Inventory Demand Data Integrity & Net Sales Calculation', () => {
  let org;
  let shop1, shop2;
  let product1, product2;
  let testUser;

  beforeAll(async () => {
    await sequelize.authenticate();

    // 1. Setup Organization & Subscription
    org = await Organization.create({
      name: 'Demand Integrity Corp',
      slug: 'demand-corp-' + Date.now(),
      currency: 'KES',
      status: 'active'
    });

    const plan = await Plan.findOne();
    if (plan) {
      await Subscription.create({
        organizationId: org.id,
        planId: plan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31')
      });
    }

    // 2. Setup 2 isolated Shops
    shop1 = await Shop.create({
      name: 'Shop Alpha',
      organizationId: org.id,
      currency: 'KES',
      status: 'active'
    });

    shop2 = await Shop.create({
      name: 'Shop Beta',
      organizationId: org.id,
      currency: 'KES',
      status: 'active'
    });

    // 3. User
    testUser = await User.create({
      name: 'Manager Bob',
      email: `bob-${Date.now()}@demandtest.com`,
      password: 'hashedPassword123',
      role: 'manager',
      organizationId: org.id,
      shopId: shop1.id
    });

    // 4. Products & Inventory
    product1 = await Product.create({
      name: 'Widget A',
      sku: 'WIDGET-A-' + Date.now(),
      price: 100.0,
      cost: 50.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: product1.id,
      shopId: shop1.id,
      stockQuantity: 100
    });

    product2 = await Product.create({
      name: 'Widget B (Shop 2)',
      sku: 'WIDGET-B-' + Date.now(),
      price: 200.0,
      cost: 100.0,
      shopId: shop2.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: product2.id,
      shopId: shop2.id,
      stockQuantity: 50
    });
  });

  afterAll(async () => {
    try {
      if (shop1) await StockMovement.destroy({ where: { shopId: shop1.id } });
      if (shop2) await StockMovement.destroy({ where: { shopId: shop2.id } });
      if (shop1) await SalePayment.destroy({ where: { shopId: shop1.id } });
      if (shop2) await SalePayment.destroy({ where: { shopId: shop2.id } });
      if (product1) await SaleRefund.destroy({ where: { productId: product1.id } });
      if (product2) await SaleRefund.destroy({ where: { productId: product2.id } });
      if (shop1) await SaleRefund.destroy({ where: { shopId: shop1.id } });
      if (product1) await SaleItem.destroy({ where: { productId: product1.id } });
      if (product2) await SaleItem.destroy({ where: { productId: product2.id } });
      if (shop1) await SaleItem.destroy({ where: { shopId: shop1.id } });
      if (shop1) await Sale.destroy({ where: { shopId: shop1.id } });
      if (shop2) await Sale.destroy({ where: { shopId: shop2.id } });
      if (product1) await Inventory.destroy({ where: { productId: product1.id } });
      if (product2) await Inventory.destroy({ where: { productId: product2.id } });
      if (shop1) await Inventory.destroy({ where: { shopId: shop1.id } });
      if (product1) await Product.destroy({ where: { id: product1.id } });
      if (product2) await Product.destroy({ where: { id: product2.id } });
      if (shop1) await Product.destroy({ where: { shopId: shop1.id } });
      if (shop1) await ActivityLog.destroy({ where: { shopId: shop1.id } });
      if (shop2) await ActivityLog.destroy({ where: { shopId: shop2.id } });
      if (testUser) await ActivityLog.destroy({ where: { userId: testUser.id } });
      if (testUser) await User.destroy({ where: { id: testUser.id } });
      if (shop1) await Shop.destroy({ where: { id: shop1.id } });
      if (shop2) await Shop.destroy({ where: { id: shop2.id } });
      if (org) {
        await Subscription.destroy({ where: { organizationId: org.id } });
        await Organization.destroy({ where: { id: org.id } });
      }
    } catch (e) {
      console.warn('Cleanup error:', e.message);
    }
  });

  it('1. Completed sale contributes fully to demand', async () => {
    const sale = await Sale.create({
      shopId: shop1.id,
      userId: testUser.id,
      total: 1000.0,
      paymentMethod: 'cash',
      paymentAmount: 1000.0,
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: product1.id,
      quantity: 10,
      price: 100.0,
      shopId: shop1.id
    });

    const query = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rows = await SaleItem.findAll(query);

    const p1Row = rows.find(r => r.productId === product1.id);
    expect(p1Row).toBeDefined();
    expect(Number(p1Row.qty)).toBe(10);
  });

  it('2. Cancelled sale (saleStatus = cancelled) does NOT contribute to demand', async () => {
    const saleCancelled = await Sale.create({
      shopId: shop1.id,
      userId: testUser.id,
      total: 800.0,
      paymentMethod: 'cash',
      paymentAmount: 800.0,
      saleStatus: 'cancelled'
    });

    await SaleItem.create({
      saleId: saleCancelled.id,
      productId: product1.id,
      quantity: 8,
      price: 100.0,
      shopId: shop1.id
    });

    const query = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rows = await SaleItem.findAll(query);

    const p1Row = rows.find(r => r.productId === product1.id);
    // Demand must still be only 10 from Test 1, not 18
    expect(Number(p1Row.qty)).toBe(10);
  });

  it('3. Legacy cancelled sale (status = cancelled) does NOT contribute to demand', async () => {
    const saleLegacyCancel = await Sale.create({
      shopId: shop1.id,
      userId: testUser.id,
      total: 500.0,
      paymentMethod: 'cash',
      paymentAmount: 500.0,
      status: 'cancelled',
      saleStatus: 'completed' // even if saleStatus was default 'completed', status = 'cancelled' must exclude
    });

    await SaleItem.create({
      saleId: saleLegacyCancel.id,
      productId: product1.id,
      quantity: 5,
      price: 100.0,
      shopId: shop1.id
    });

    const query = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rows = await SaleItem.findAll(query);

    const p1Row = rows.find(r => r.productId === product1.id);
    // Must remain 10
    expect(Number(p1Row.qty)).toBe(10);
  });

  it('4. Fully refunded sale (saleStatus = refunded) does NOT contribute to demand', async () => {
    const saleRefunded = await Sale.create({
      shopId: shop1.id,
      userId: testUser.id,
      total: 400.0,
      paymentMethod: 'cash',
      paymentAmount: 400.0,
      saleStatus: 'refunded'
    });

    await SaleItem.create({
      saleId: saleRefunded.id,
      productId: product1.id,
      quantity: 4,
      price: 100.0,
      shopId: shop1.id
    });

    const query = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rows = await SaleItem.findAll(query);

    const p1Row = rows.find(r => r.productId === product1.id);
    // Must remain 10
    expect(Number(p1Row.qty)).toBe(10);
  });

  it('5. Partially refunded sale contributes only net sold quantity', async () => {
    const salePartial = await Sale.create({
      shopId: shop1.id,
      userId: testUser.id,
      total: 600.0,
      paymentMethod: 'cash',
      paymentAmount: 600.0,
      saleStatus: 'partial_refund'
    });

    await SaleItem.create({
      saleId: salePartial.id,
      productId: product1.id,
      quantity: 6,
      price: 100.0,
      shopId: shop1.id
    });

    // 2 units refunded with status 'processed'
    await SaleRefund.create({
      saleId: salePartial.id,
      productId: product1.id,
      quantity: 2,
      amount: 200.0,
      status: 'processed',
      shopId: shop1.id
    });

    const query = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rows = await SaleItem.findAll(query);

    const p1Row = rows.find(r => r.productId === product1.id);
    // Previous demand 10 + net demand (6 - 2 = 4) = 14
    expect(Number(p1Row.qty)).toBe(14);
  });

  it('6. Pending/failed refund does NOT reduce net demand (only processed refunds count)', async () => {
    const saleWithPendingRefund = await Sale.create({
      shopId: shop1.id,
      userId: testUser.id,
      total: 300.0,
      paymentMethod: 'cash',
      paymentAmount: 300.0,
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleWithPendingRefund.id,
      productId: product1.id,
      quantity: 3,
      price: 100.0,
      shopId: shop1.id
    });

    // Pending refund of 1 unit
    await SaleRefund.create({
      saleId: saleWithPendingRefund.id,
      productId: product1.id,
      quantity: 1,
      amount: 100.0,
      status: 'pending',
      shopId: shop1.id
    });

    const query = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rows = await SaleItem.findAll(query);

    const p1Row = rows.find(r => r.productId === product1.id);
    // Previous 14 + full 3 (pending refund does not reduce) = 17
    expect(Number(p1Row.qty)).toBe(17);
  });

  it('7. Multi-tenant shop isolation: sales in Shop 2 cannot leak into Shop 1 demand', async () => {
    const saleShop2 = await Sale.create({
      shopId: shop2.id,
      userId: testUser.id,
      total: 2500.0,
      paymentMethod: 'cash',
      paymentAmount: 2500.0,
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleShop2.id,
      productId: product2.id,
      quantity: 25,
      price: 100.0,
      shopId: shop2.id
    });

    // Query Shop 1
    const queryShop1 = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rowsShop1 = await SaleItem.findAll(queryShop1);
    const p2InShop1 = rowsShop1.find(r => r.productId === product2.id);
    expect(p2InShop1).toBeUndefined(); // Product 2 must NOT appear in Shop 1
    const p1InShop1 = rowsShop1.find(r => r.productId === product1.id);
    expect(Number(p1InShop1.qty)).toBe(17);

    // Query Shop 2
    const queryShop2 = buildNetDemandQuery(shop2.id, new Date(Date.now() - 86400000), false);
    const rowsShop2 = await SaleItem.findAll(queryShop2);
    const p2InShop2 = rowsShop2.find(r => r.productId === product2.id);
    expect(p2InShop2).toBeDefined();
    expect(Number(p2InShop2.qty)).toBe(25);
  });

  it('8. Legacy/missing saleStatus and status (NULL) defaults to completed and counts toward demand', async () => {
    // Test raw query insertion or model creation where status fields might be unpopulated
    const legacySale = await Sale.create({
      shopId: shop1.id,
      userId: testUser.id,
      total: 500.0,
      paymentMethod: 'cash',
      paymentAmount: 500.0,
      // saleStatus defaults to 'completed' per Sequelize model definition
    });

    await SaleItem.create({
      saleId: legacySale.id,
      productId: product1.id,
      quantity: 5,
      price: 100.0,
      shopId: shop1.id
    });

    const query = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false);
    const rows = await SaleItem.findAll(query);

    const p1Row = rows.find(r => r.productId === product1.id);
    // Previous 17 + 5 = 22
    expect(Number(p1Row.qty)).toBe(22);
  });

  it('9. Group by date yields correct net daily demand series', async () => {
    const queryDaily = buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), true);
    const rowsDaily = await SaleItem.findAll(queryDaily);

    expect(rowsDaily.length).toBeGreaterThan(0);
    const totalDailySum = rowsDaily
      .filter(r => r.productId === product1.id)
      .reduce((sum, r) => sum + Number(r.quantity), 0);

    // Sum of daily breakdown must match the aggregated sum (22)
    expect(totalDailySum).toBe(22);
  });

  it('10. Duplicate SaleItem lines for same productId do not double-subtract refunds and support full multi-step refunds', async () => {
    const dupProduct = await Product.create({
      name: 'Duplicate Line Product',
      sku: 'DUP-PROD-' + Date.now(),
      price: 100.0,
      cost: 50.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: dupProduct.id,
      shopId: shop1.id,
      stockQuantity: 20
    });

    const dupSale = await Sale.create({
      invoiceNumber: 'INV-DUP-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      subtotal: 500.0,
      total: 500.0,
      paymentMethod: 'cash',
      paymentAmount: 500.0,
      saleStatus: 'completed',
      status: 'completed'
    });

    // Two separate SaleItem rows for dupProduct in the same sale: 3 units + 2 units = 5 units total
    await SaleItem.create({
      saleId: dupSale.id,
      productId: dupProduct.id,
      quantity: 3,
      unitPrice: 100.0,
      price: 100.0,
      subtotal: 300.0,
      shopId: shop1.id
    });
    await SaleItem.create({
      saleId: dupSale.id,
      productId: dupProduct.id,
      quantity: 2,
      unitPrice: 100.0,
      price: 100.0,
      subtotal: 200.0,
      shopId: shop1.id
    });

    // Process a partial refund of 4 units (which exceeds either single line of 3 or 2, but is <= total 5)
    const reqRefund1 = {
      params: { saleId: String(dupSale.id) },
      body: {
        items: [{ productId: dupProduct.id, quantity: 4, disposition: 'restock', reasonCode: 'CHANGED_MIND' }]
      },
      user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    };
    const resRefund1 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await saleController.processRefund(reqRefund1, resRefund1);

    expect(resRefund1.json).toHaveBeenCalledWith(
      expect.objectContaining({
        saleStatus: 'partial_refund',
        totalRefundAmount: 400
      })
    );

    // Verify buildNetDemandQuery does NOT double-subtract the 4-unit refund across the 2 SaleItem rows
    // Expected net demand = (3 + 2) - 4 = 1 (NOT (3 - 4) + (2 - 4) = 0)
    const aggRows = await SaleItem.findAll(buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false));
    const dupAggRow = aggRows.find(r => r.productId === dupProduct.id);
    expect(dupAggRow).toBeDefined();
    expect(Number(dupAggRow.qty)).toBe(1);

    const dailyRows = await SaleItem.findAll(buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), true));
    const dupDailySum = dailyRows
      .filter(r => r.productId === dupProduct.id)
      .reduce((sum, r) => sum + Number(r.quantity), 0);
    expect(dupDailySum).toBe(1);
  });

  it('11. Pending, confirmed, processing, and failed-fulfillment sales do NOT contribute to demand', async () => {
    const statusProduct = await Product.create({
      name: 'Unfulfilled Status Product',
      sku: 'UNFULFILLED-' + Date.now(),
      price: 100.0,
      cost: 50.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    const nonRealizedSales = [
      { saleStatus: 'pending', status: 'pending', fulfillmentStatus: 'pending' },
      { saleStatus: 'confirmed', status: 'completed', fulfillmentStatus: 'pending' },
      { saleStatus: 'processing', status: 'completed', fulfillmentStatus: 'processing' },
      { saleStatus: 'completed', status: 'completed', fulfillmentStatus: 'failed' }
    ];

    for (const state of nonRealizedSales) {
      const s = await Sale.create({
        shopId: shop1.id,
        userId: testUser.id,
        total: 300.0,
        paymentMethod: 'cash',
        paymentAmount: 300.0,
        ...state
      });
      await SaleItem.create({
        saleId: s.id,
        productId: statusProduct.id,
        quantity: 3,
        price: 100.0,
        shopId: shop1.id
      });
    }

    const rows = await SaleItem.findAll(buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false));
    const statusProdRow = rows.find(r => r.productId === statusProduct.id);
    expect(statusProdRow).toBeUndefined();
  });

  it('12. Cancelling a sale via updateSale restores unreturned stock, synchronizes status/saleStatus, excludes demand, and is idempotent', async () => {
    const cancelProd = await Product.create({
      name: 'Cancel Test Product',
      sku: 'CANCEL-PROD-' + Date.now(),
      price: 150.0,
      cost: 75.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    // Initial stock after a 5-unit sale is 45 (was 50 before sale)
    await Inventory.create({
      productId: cancelProd.id,
      shopId: shop1.id,
      stockQuantity: 45
    });

    const saleToCancel = await Sale.create({
      invoiceNumber: 'INV-CANCEL-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      subtotal: 750.0,
      total: 750.0,
      paymentMethod: 'cash',
      paymentAmount: 750.0,
      saleStatus: 'completed',
      status: 'completed'
    });

    await SaleItem.create({
      saleId: saleToCancel.id,
      productId: cancelProd.id,
      quantity: 5,
      price: 150.0,
      shopId: shop1.id
    });

    // Call updateSale with status: 'cancelled'
    const reqCancel = {
      params: { id: String(saleToCancel.id) },
      body: { status: 'cancelled', notes: 'Customer voided transaction' },
      user: { id: testUser.id, role: 'manager', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    };
    const resCancel = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await saleController.updateSale(reqCancel, resCancel);

    const refreshedSale = await Sale.findByPk(saleToCancel.id);
    expect(refreshedSale.status).toBe('cancelled');
    expect(refreshedSale.saleStatus).toBe('cancelled');
    expect(refreshedSale.cancelledAt).not.toBeNull();

    const invAfterFirstCancel = await Inventory.findOne({ where: { productId: cancelProd.id, shopId: shop1.id } });
    expect(Number(invAfterFirstCancel.stockQuantity)).toBe(50);

    // Calling updateSale(status: 'cancelled') a second time must be idempotent (stock stays 50)
    const resCancelRetry = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await saleController.updateSale(reqCancel, resCancelRetry);

    const invAfterSecondCancel = await Inventory.findOne({ where: { productId: cancelProd.id, shopId: shop1.id } });
    expect(Number(invAfterSecondCancel.stockQuantity)).toBe(50);

    const cancelMovements = await StockMovement.findAll({
      where: {
        shopId: shop1.id,
        productId: cancelProd.id,
        reference: `CANCEL-${saleToCancel.invoiceNumber}`
      }
    });
    expect(cancelMovements).toHaveLength(1);
    expect(Number(cancelMovements[0].quantity)).toBe(5);

    // Cancelled sale must not appear in net demand
    const demandRows = await SaleItem.findAll(buildNetDemandQuery(shop1.id, new Date(Date.now() - 86400000), false));
    expect(demandRows.find(r => r.productId === cancelProd.id)).toBeUndefined();
  });

  it('13. Deleting a partially refunded sale (with restock and damaged_writeoff) via deleteSale restores only unreturned units and uses valid ENUMs', async () => {
    const delProd = await Product.create({
      name: 'Delete Partial Refund Product',
      sku: 'DEL-PROD-' + Date.now(),
      price: 100.0,
      cost: 50.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    // Suppose 6 units were sold; 2 were restocked via refund, 1 was written off as damaged, leaving 3 unreturned units with customer.
    // Current stock before deleteSale is 30. Deleting the sale should restore only the 3 unreturned units -> 33.
    await Inventory.create({
      productId: delProd.id,
      shopId: shop1.id,
      stockQuantity: 30
    });

    const saleToDelete = await Sale.create({
      invoiceNumber: 'INV-DEL-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      subtotal: 600.0,
      total: 600.0,
      paymentMethod: 'cash',
      paymentAmount: 600.0,
      saleStatus: 'partial_refund',
      status: 'completed'
    });

    await SaleItem.create({
      saleId: saleToDelete.id,
      productId: delProd.id,
      quantity: 6,
      price: 100.0,
      shopId: shop1.id
    });

    await SaleRefund.create({
      saleId: saleToDelete.id,
      productId: delProd.id,
      quantity: 2,
      amount: 200.0,
      disposition: 'restock',
      status: 'processed',
      shopId: shop1.id
    });

    await SaleRefund.create({
      saleId: saleToDelete.id,
      productId: delProd.id,
      quantity: 1,
      amount: 100.0,
      disposition: 'damaged_writeoff',
      status: 'processed',
      shopId: shop1.id
    });

    const reqDel = {
      params: { id: String(saleToDelete.id) },
      user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    };
    const resDel = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await saleController.deleteSale(reqDel, resDel);

    expect(resDel.json).toHaveBeenCalledWith({ message: 'Sale deleted successfully' });

    const deletedSale = await Sale.findByPk(saleToDelete.id);
    expect(deletedSale.status).toBe('cancelled');
    expect(deletedSale.saleStatus).toBe('cancelled');
    expect(deletedSale.metadata?.isDeleted).toBe(true);

    const invAfterDel = await Inventory.findOne({ where: { productId: delProd.id, shopId: shop1.id } });
    // 30 + (6 sold - 2 restocked - 1 damaged_writeoff) = 33
    expect(Number(invAfterDel.stockQuantity)).toBe(33);

    // Calling deleteSale again is idempotent
    const resDelRetry = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await saleController.deleteSale(reqDel, resDelRetry);
    const invAfterDelRetry = await Inventory.findOne({ where: { productId: delProd.id, shopId: shop1.id } });
    expect(Number(invAfterDelRetry.stockQuantity)).toBe(33);
  });

  it('14. getDailySales includes partial_refund sales at net revenue and excludes cancelled/refunded sales', async () => {
    const dailyShop = await Shop.create({
      name: 'Daily Sales Net Shop',
      organizationId: org.id,
      currency: 'KES',
      status: 'active'
    });

    try {
      // 1. Completed sale: 500
      await Sale.create({
        shopId: dailyShop.id,
        userId: testUser.id,
        subtotal: 500,
        total: 500,
        paymentMethod: 'cash',
        paymentAmount: 500,
        saleStatus: 'completed',
        status: 'completed'
      });

      // 2. Partial refund sale: gross 400, refunded 150 -> net 250
      const partialSale = await Sale.create({
        shopId: dailyShop.id,
        userId: testUser.id,
        subtotal: 400,
        total: 400,
        paymentMethod: 'cash',
        paymentAmount: 400,
        saleStatus: 'partial_refund',
        status: 'completed'
      });
      await SaleRefund.create({
        saleId: partialSale.id,
        productId: product1.id,
        quantity: 1,
        amount: 150,
        refundAmount: 150,
        status: 'processed',
        shopId: dailyShop.id
      });

      // 3. Fully refunded sale: 300 (excluded)
      await Sale.create({
        shopId: dailyShop.id,
        userId: testUser.id,
        subtotal: 300,
        total: 300,
        paymentMethod: 'cash',
        paymentAmount: 300,
        saleStatus: 'refunded',
        status: 'completed'
      });

      // 4. Cancelled sale: 900 (excluded)
      await Sale.create({
        shopId: dailyShop.id,
        userId: testUser.id,
        subtotal: 900,
        total: 900,
        paymentMethod: 'cash',
        paymentAmount: 900,
        saleStatus: 'cancelled',
        status: 'cancelled'
      });

      const reqDaily = {
        user: { id: testUser.id, role: 'admin', shopId: dailyShop.id, organizationId: org.id },
        shopId: dailyShop.id,
        query: { days: '7' }
      };
      const resDaily = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await insightsController.getDailySales(reqDaily, resDaily);

      expect(resDaily.json).toHaveBeenCalled();
      const payload = resDaily.json.mock.calls[0][0];
      expect(Array.isArray(payload.values)).toBe(true);
      const totalNetRevenue = payload.values.reduce((sum, v) => sum + Number(v || 0), 0);
      // 500 (completed) + 250 (partial_refund net) = 750
      expect(totalNetRevenue).toBe(750);
    } finally {
      await SaleRefund.destroy({ where: { shopId: dailyShop.id } });
      await Sale.destroy({ where: { shopId: dailyShop.id } });
      await Shop.destroy({ where: { id: dailyShop.id } });
    }
  });

  it('15. getStockDepletionForecast linear fallback returns 0 days for zero-stock products and uses calendar lookback window', async () => {
    const forecastShop = await Shop.create({
      name: 'Forecast Fallback Shop',
      organizationId: org.id,
      currency: 'KES',
      status: 'active'
    });

    const zeroStockProd = await Product.create({
      name: 'Out of Stock Widget',
      sku: 'OOS-WIDGET-' + Date.now(),
      price: 100,
      cost: 50,
      shopId: forecastShop.id,
      organizationId: org.id,
      active: true
    });
    const depletingProd = await Product.create({
      name: 'Depleting Velocity Widget',
      sku: 'DEPLETING-WIDGET-' + Date.now(),
      price: 100,
      cost: 50,
      shopId: forecastShop.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: zeroStockProd.id,
      shopId: forecastShop.id,
      stockQuantity: 0
    });
    await Inventory.create({
      productId: depletingProd.id,
      shopId: forecastShop.id,
      stockQuantity: 5
    });

    try {
      const s = await Sale.create({
        shopId: forecastShop.id,
        userId: testUser.id,
        subtotal: 1900,
        total: 1900,
        paymentMethod: 'cash',
        paymentAmount: 1900,
        saleStatus: 'completed',
        status: 'completed'
      });

      await SaleItem.create({
        saleId: s.id,
        productId: zeroStockProd.id,
        quantity: 5,
        price: 100,
        shopId: forecastShop.id
      });
      await SaleItem.create({
        saleId: s.id,
        productId: depletingProd.id,
        quantity: 14,
        price: 100,
        shopId: forecastShop.id
      });

      const aiClient = require('../src/utils/aiClient');
      const postSpy = jest.spyOn(aiClient, 'post').mockRejectedValueOnce(new Error('AI service offline'));

      try {
        const alerts = await insightsController.getStockDepletionForecast(
          forecastShop.id,
          { id: testUser.id, role: 'admin', shopId: forecastShop.id, organizationId: org.id }
        );

        expect(postSpy).toHaveBeenCalledWith(
          '/api/forecasting/stock-depletion',
          expect.objectContaining({
            lookback_days: 90,
            reference_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
          }),
          expect.any(Object)
        );

        expect(Array.isArray(alerts)).toBe(true);

        const oosItem = alerts.find(i => Number(i.id) === zeroStockProd.id);
        expect(oosItem).toBeDefined();
        expect(oosItem.daysToDeplete).toBe(0);

        const depItem = alerts.find(i => Number(i.id) === depletingProd.id);
        expect(depItem).toBeDefined();
        // 14 units over 14-day fallback window = 1.0/day; 5 stock / 1.0 = 5 days
        expect(depItem.daysToDeplete).toBe(5);
      } finally {
        postSpy.mockRestore();
      }
    } finally {
      await SaleItem.destroy({ where: { shopId: forecastShop.id } });
      await Sale.destroy({ where: { shopId: forecastShop.id } });
      await Inventory.destroy({ where: { shopId: forecastShop.id } });
      await Product.destroy({ where: { shopId: forecastShop.id } });
      await Shop.destroy({ where: { id: forecastShop.id } });
    }
  });
});
