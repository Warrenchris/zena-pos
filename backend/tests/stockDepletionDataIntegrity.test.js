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

  it('16. F-3 Concurrency: Two simultaneous partial refunds on the same sale serialize under row lock and prevent over-refunding', async () => {
    const concProd = await Product.create({
      name: 'Concurrent Refund Product',
      sku: 'CONC-REF-' + Date.now(),
      price: 100.0,
      cost: 50.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: concProd.id,
      shopId: shop1.id,
      stockQuantity: 20
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-CONC-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      subtotal: 400.0,
      total: 400.0,
      paymentMethod: 'cash',
      paymentAmount: 400.0,
      saleStatus: 'completed',
      status: 'completed'
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: concProd.id,
      quantity: 4,
      price: 100.0,
      unitPrice: 100.0,
      subtotal: 400.0,
      shopId: shop1.id
    });

    const makeReq = (key) => ({
      params: { saleId: String(sale.id) },
      headers: { 'idempotency-key': key },
      body: {
        items: [{ productId: concProd.id, quantity: 3, disposition: 'restock', reasonCode: 'DEFECTIVE' }]
      },
      user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    });

    const makeRes = () => {
      const res = { statusCode: 200, body: null };
      res.status = jest.fn((code) => {
        res.statusCode = code;
        return res;
      });
      res.json = jest.fn((payload) => {
        res.body = payload;
        return res;
      });
      return res;
    };

    const resA = makeRes();
    const resB = makeRes();

    // Launch both 3-unit refund requests concurrently against a 4-unit sale
    await Promise.all([
      saleController.processRefund(makeReq('conc-key-A-' + Date.now()), resA),
      saleController.processRefund(makeReq('conc-key-B-' + Date.now()), resB)
    ]);

    const statusCodes = [resA.statusCode, resB.statusCode].sort();
    // Exactly one must succeed (200) and the other must be rejected (400)
    expect(statusCodes).toEqual([200, 400]);

    const refundsInDb = await SaleRefund.findAll({ where: { saleId: sale.id, status: 'processed' } });
    expect(refundsInDb).toHaveLength(1);
    expect(Number(refundsInDb[0].quantity)).toBe(3);

    const updatedInv = await Inventory.findOne({ where: { productId: concProd.id, shopId: shop1.id } });
    // Initial 20 + 3 restocked = 23 (never 26!)
    expect(Number(updatedInv.stockQuantity)).toBe(23);
  });

  it('17. F-3 Concurrency: Concurrent refund and sale cancellation serialize cleanly without double-restoring stock or payments', async () => {
    const raceProd = await Product.create({
      name: 'Race Cancel Refund Product',
      sku: 'RACE-CR-' + Date.now(),
      price: 100.0,
      cost: 50.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: raceProd.id,
      shopId: shop1.id,
      stockQuantity: 10
    });

    const raceSale = await Sale.create({
      invoiceNumber: 'INV-RACE-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      subtotal: 500.0,
      total: 500.0,
      paymentMethod: 'cash',
      paymentAmount: 500.0,
      saleStatus: 'completed',
      status: 'completed'
    });

    await SaleItem.create({
      saleId: raceSale.id,
      productId: raceProd.id,
      quantity: 5,
      price: 100.0,
      unitPrice: 100.0,
      subtotal: 500.0,
      shopId: shop1.id
    });

    const reqRefund = {
      params: { saleId: String(raceSale.id) },
      headers: { 'idempotency-key': 'race-refund-' + Date.now() },
      body: {
        items: [{ productId: raceProd.id, quantity: 2, disposition: 'restock', reasonCode: 'OTHER' }]
      },
      user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    };
    const resRefund = {
      statusCode: 200,
      status: jest.fn(function (c) { this.statusCode = c; return this; }),
      json: jest.fn(function (b) { this.body = b; return this; })
    };

    const reqCancel = {
      params: { id: String(raceSale.id) },
      body: { status: 'cancelled', notes: 'Concurrent cancellation' },
      user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    };
    const resCancel = {
      statusCode: 200,
      status: jest.fn(function (c) { this.statusCode = c; return this; }),
      json: jest.fn(function (b) { this.body = b; return this; })
    };

    await Promise.all([
      saleController.processRefund(reqRefund, resRefund),
      saleController.updateSale(reqCancel, resCancel)
    ]);

    // Regardless of which lock acquired first:
    // - If refund ran first: +2 restocked from refund, +3 restored from cancel = +5 total -> stock = 15
    // - If cancel ran first: +5 restored from cancel, refund rejected with 400 -> stock = 15
    const finalInv = await Inventory.findOne({ where: { productId: raceProd.id, shopId: shop1.id } });
    expect(Number(finalInv.stockQuantity)).toBe(15);

    const reversalPayments = await SalePayment.findAll({ where: { saleId: raceSale.id, shopId: shop1.id } });
    const totalReversed = reversalPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    expect(totalReversed).toBe(-500);
  });

  it('18. F-3 Idempotency & Rollback: Duplicate Idempotency-Key returns 200 without re-executing, payload mismatch returns 409, and mid-transaction error rolls back completely', async () => {
    const idemProd = await Product.create({
      name: 'Idempotency Refund Product',
      sku: 'IDEM-REF-' + Date.now(),
      price: 150.0,
      cost: 75.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: idemProd.id,
      shopId: shop1.id,
      stockQuantity: 30
    });

    const idemSale = await Sale.create({
      invoiceNumber: 'INV-IDEM-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      subtotal: 450.0,
      total: 450.0,
      paymentMethod: 'cash',
      paymentAmount: 450.0,
      saleStatus: 'completed',
      status: 'completed'
    });

    await SaleItem.create({
      saleId: idemSale.id,
      productId: idemProd.id,
      quantity: 3,
      price: 150.0,
      unitPrice: 150.0,
      subtotal: 450.0,
      shopId: shop1.id
    });

    const idemKey = `idem-refund-key-${Date.now()}`;
    const buildReq = (qty, key = idemKey) => ({
      params: { saleId: String(idemSale.id) },
      headers: { 'idempotency-key': key },
      body: {
        items: [{ productId: idemProd.id, quantity: qty, disposition: 'restock', reasonCode: 'DEFECTIVE' }]
      },
      user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    });
    const buildRes = () => ({
      statusCode: 200,
      body: null,
      status: jest.fn(function (c) { this.statusCode = c; return this; }),
      json: jest.fn(function (b) { this.body = b; return this; })
    });

    // 1. First request with idemKey (1 unit)
    const res1 = buildRes();
    await saleController.processRefund(buildReq(1), res1);
    expect(res1.statusCode).toBe(200);
    expect(res1.body.totalRefundAmount).toBe(150);

    // 2. Duplicate retry with same idemKey and same payload (1 unit) -> 200 with isDuplicate: true, stock stays 31
    const res2 = buildRes();
    await saleController.processRefund(buildReq(1), res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.isDuplicate).toBe(true);
    expect(res2.body.totalRefundAmount).toBe(150);

    const invAfterRetry = await Inventory.findOne({ where: { productId: idemProd.id, shopId: shop1.id } });
    expect(Number(invAfterRetry.stockQuantity)).toBe(31);
    const refundCountAfterRetry = await SaleRefund.count({ where: { saleId: idemSale.id } });
    expect(refundCountAfterRetry).toBe(1);

    // 3. Reuse same idemKey with DIFFERENT payload (quantity: 2) -> 409 IDEMPOTENCY_KEY_REUSED
    const resConflict = buildRes();
    await saleController.processRefund(buildReq(2), resConflict);
    expect(resConflict.statusCode).toBe(409);
    expect(resConflict.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    // 4. Simulated mid-transaction failure during SalePayment.create rolls back SaleRefund and Inventory
    const createPaymentSpy = jest.spyOn(SalePayment, 'create').mockRejectedValueOnce(new Error('Simulated DB write failure'));
    try {
      const resFail = buildRes();
      await saleController.processRefund(buildReq(1, `new-key-fail-${Date.now()}`), resFail);
      expect(resFail.statusCode).toBe(500);
    } finally {
      createPaymentSpy.mockRestore();
    }

    const invAfterRollback = await Inventory.findOne({ where: { productId: idemProd.id, shopId: shop1.id } });
    expect(Number(invAfterRollback.stockQuantity)).toBe(31);
    const refundCountAfterRollback = await SaleRefund.count({ where: { saleId: idemSale.id } });
    expect(refundCountAfterRollback).toBe(1);
  });

  it('19. F-4 Cancellation Financial & Customer Reversal: Cancelling a partially refunded customer-linked sale reverses only remaining unrefunded payment, totalPurchases, and loyaltyPoints idempotently', async () => {
    const { Customer } = require('../src/models');
    const cust = await Customer.create({
      name: 'Loyalty Customer',
      email: `loyalty-${Date.now()}@test.com`,
      phone: '0712345678',
      shopId: shop1.id,
      organizationId: org.id,
      totalPurchases: 1000.0,
      loyaltyPoints: 1000
    });

    const finProd = await Product.create({
      name: 'Financial Reversal Product',
      sku: 'FIN-REV-' + Date.now(),
      price: 200.0,
      cost: 100.0,
      shopId: shop1.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: finProd.id,
      shopId: shop1.id,
      stockQuantity: 10
    });

    const custSale = await Sale.create({
      invoiceNumber: 'INV-FIN-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      customerId: cust.id,
      subtotal: 1000.0,
      total: 1000.0,
      paymentMethod: 'cash',
      paymentAmount: 1000.0,
      saleStatus: 'completed',
      status: 'completed'
    });

    await SaleItem.create({
      saleId: custSale.id,
      productId: finProd.id,
      quantity: 5,
      price: 200.0,
      unitPrice: 200.0,
      subtotal: 1000.0,
      shopId: shop1.id
    });

    await SalePayment.create({
      saleId: custSale.id,
      shopId: shop1.id,
      amount: 1000.0,
      paymentMethod: 'cash',
      paymentReference: custSale.invoiceNumber,
      status: 'completed'
    });

    try {
      // Step 1: Partial refund of 2 units (400 KSh)
      const reqRef = {
        params: { saleId: String(custSale.id) },
        body: {
          items: [{ productId: finProd.id, quantity: 2, disposition: 'restock', reasonCode: 'OTHER' }]
        },
        user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
        shopId: shop1.id,
        organizationId: org.id
      };
      const resRef = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await saleController.processRefund(reqRef, resRef);

      const custAfterPartial = await Customer.findByPk(cust.id);
      expect(Number(custAfterPartial.totalPurchases)).toBe(600);
      expect(Number(custAfterPartial.loyaltyPoints)).toBe(600);

      // Step 2: Cancel the partially refunded sale -> reverses remaining 600 KSh and 3 units
      const reqCancel = {
        params: { id: String(custSale.id) },
        body: { status: 'cancelled', notes: 'Cancel remainder' },
        user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
        shopId: shop1.id,
        organizationId: org.id
      };
      const resCancel = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await saleController.updateSale(reqCancel, resCancel);

      const custAfterCancel = await Customer.findByPk(cust.id);
      expect(Number(custAfterCancel.totalPurchases)).toBe(0);
      expect(Number(custAfterCancel.loyaltyPoints)).toBe(0);

      const paymentsAfterCancel = await SalePayment.findAll({ where: { saleId: custSale.id, shopId: shop1.id } });
      const netPayments = paymentsAfterCancel.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      // +1000 initial - 400 partial refund - 600 cancel reversal = 0
      expect(netPayments).toBe(0);

      const cancelReversals = paymentsAfterCancel.filter(p => p.metadata?.isCancelReversal === true);
      expect(cancelReversals).toHaveLength(1);
      expect(Number(cancelReversals[0].amount)).toBe(-600);

      // Step 3: Calling updateSale(cancelled) or deleteSale again is idempotent
      const resCancelRetry = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      await saleController.updateSale(reqCancel, resCancelRetry);
      const paymentsAfterRetry = await SalePayment.findAll({ where: { saleId: custSale.id, shopId: shop1.id } });
      expect(paymentsAfterRetry.filter(p => p.metadata?.isCancelReversal === true)).toHaveLength(1);
    } finally {
      await Sale.update({ customerId: null }, { where: { customerId: cust.id } });
      await Customer.destroy({ where: { id: cust.id } });
    }
  });

  it('20. F-5 & F-9: Direct status transition to refunded via updateSale is rejected with 400, and cross-shop refund is rejected with 404', async () => {
    const guardSale = await Sale.create({
      invoiceNumber: 'INV-GUARD-' + Date.now(),
      shopId: shop1.id,
      userId: testUser.id,
      subtotal: 100.0,
      total: 100.0,
      paymentMethod: 'cash',
      paymentAmount: 100.0,
      saleStatus: 'completed',
      status: 'completed'
    });

    // Attempt direct status='refunded' via updateSale -> 400
    const reqDirectRefund = {
      params: { id: String(guardSale.id) },
      body: { status: 'refunded' },
      user: { id: testUser.id, role: 'admin', shopId: shop1.id, organizationId: org.id },
      shopId: shop1.id,
      organizationId: org.id
    };
    const resDirectRefund = { statusCode: 200, status: jest.fn(function (c) { this.statusCode = c; return this; }), json: jest.fn() };
    await saleController.updateSale(reqDirectRefund, resDirectRefund);
    expect(resDirectRefund.statusCode).toBe(400);

    const unchangedSale = await Sale.findByPk(guardSale.id);
    expect(unchangedSale.saleStatus).toBe('completed');
    expect(unchangedSale.status).toBe('completed');

    // Attempt cross-shop refund from shop2 on shop1's sale -> 404
    const reqCrossShopRefund = {
      params: { saleId: String(guardSale.id) },
      body: { items: [{ productId: product1.id, quantity: 1 }] },
      user: { id: testUser.id, role: 'admin', shopId: shop2.id, organizationId: org.id },
      shopId: shop2.id,
      organizationId: org.id
    };
    const resCrossShopRefund = { statusCode: 200, status: jest.fn(function (c) { this.statusCode = c; return this; }), json: jest.fn() };
    await saleController.processRefund(reqCrossShopRefund, resCrossShopRefund);
    expect(resCrossShopRefund.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// H-03 Regression: Two distinct partial refunds with different keys but
//   identical item quantities must both be processed (not over-deduplicated).
// H-01 Regression: Ascending productId sort in createSaleInternal preserves
//   all item field data (quantity, price, discount) after the sort.
// ---------------------------------------------------------------------------
describe('H-01 & H-03 Regressions: lock-order sort and refund idempotency contract', () => {
  let org2, shop, testUser2, prodA, prodB;

  beforeAll(async () => {
    await sequelize.authenticate();
    org2 = await Organization.create({
      name: 'Lock Order Org ' + Date.now(),
      slug: 'lock-order-' + Date.now(),
      currency: 'KES',
      status: 'active'
    });
    shop = await Shop.create({
      name: 'Lock Order Shop',
      organizationId: org2.id,
      currency: 'KES',
      status: 'active'
    });
    testUser2 = await User.create({
      name: 'Lock Order User',
      email: `lock-order-${Date.now()}@test.com`,
      password: 'hashedPassword123',
      role: 'admin',
      organizationId: org2.id,
      shopId: shop.id
    });
    // prodA has a HIGHER productId so it sorts last in ascending order
    // prodB has a LOWER productId so it sorts first in ascending order
    // We create B first so its auto-increment id is lower than A's.
    prodB = await Product.create({
      name: 'Product B (lower id)',
      sku: 'LOCK-B-' + Date.now(),
      price: 50.0,
      cost: 25.0,
      shopId: shop.id,
      organizationId: org2.id,
      active: true
    });
    prodA = await Product.create({
      name: 'Product A (higher id)',
      sku: 'LOCK-A-' + Date.now(),
      price: 100.0,
      cost: 50.0,
      shopId: shop.id,
      organizationId: org2.id,
      active: true
    });
    await Inventory.create({ productId: prodA.id, shopId: shop.id, stockQuantity: 20 });
    await Inventory.create({ productId: prodB.id, shopId: shop.id, stockQuantity: 20 });
  });

  afterAll(async () => {
    try {
      if (shop) await SaleRefund.destroy({ where: { shopId: shop.id } });
      if (shop) await SaleItem.destroy({ where: { shopId: shop.id } });
      if (shop) await SalePayment.destroy({ where: { shopId: shop.id } });
      if (shop) await StockMovement.destroy({ where: { shopId: shop.id } });
      if (shop) await Sale.destroy({ where: { shopId: shop.id } });
      if (shop) await Inventory.destroy({ where: { shopId: shop.id } });
      if (prodA && prodB) await Product.destroy({ where: { id: [prodA.id, prodB.id] } });
      if (shop) await ActivityLog.destroy({ where: { shopId: shop.id } });
      if (testUser2) await ActivityLog.destroy({ where: { userId: testUser2.id } });
      if (testUser2) await User.destroy({ where: { id: testUser2.id } });
      if (shop) await Shop.destroy({ where: { id: shop.id } });
      if (org2) await Organization.destroy({ where: { id: org2.id } });
    } catch (e) {
      console.warn('Cleanup error in H01/H03 block:', e.message);
    }
  });

  it('H-03: Two sequential partial refunds with different idempotency keys and identical item quantities are both processed independently', async () => {
    // Sale with 4 units of prodA
    const sale = await Sale.create({
      invoiceNumber: 'INV-H03-' + Date.now(),
      shopId: shop.id,
      userId: testUser2.id,
      subtotal: 400.0,
      total: 400.0,
      paymentMethod: 'cash',
      paymentAmount: 400.0,
      saleStatus: 'completed',
      status: 'completed'
    });
    await SaleItem.create({
      saleId: sale.id,
      productId: prodA.id,
      quantity: 4,
      price: 100.0,
      unitPrice: 100.0,
      subtotal: 400.0,
      shopId: shop.id
    });
    await SalePayment.create({
      saleId: sale.id,
      shopId: shop.id,
      amount: 400.0,
      paymentMethod: 'cash',
      paymentReference: sale.invoiceNumber,
      status: 'completed'
    });
    await Inventory.update({ stockQuantity: 10 }, { where: { productId: prodA.id, shopId: shop.id } });

    const buildRefundReq = (qty, key) => ({
      params: { saleId: String(sale.id) },
      headers: { 'idempotency-key': key },
      body: { items: [{ productId: prodA.id, quantity: qty, disposition: 'restock', reasonCode: 'OTHER' }] },
      user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
      shopId: shop.id,
      organizationId: org2.id
    });
    const buildRes = () => ({
      statusCode: 200,
      body: null,
      status: jest.fn(function (c) { this.statusCode = c; return this; }),
      json: jest.fn(function (b) { this.body = b; return this; })
    });

    // First partial refund: 2 units, key-alpha
    const res1 = buildRes();
    await saleController.processRefund(buildRefundReq(2, 'key-alpha-' + Date.now()), res1);
    expect(res1.statusCode).toBe(200);
    expect(res1.body.isDuplicate).toBeFalsy();
    expect(res1.body.totalRefundAmount).toBe(200);

    const invAfterFirst = await Inventory.findOne({ where: { productId: prodA.id, shopId: shop.id } });
    expect(Number(invAfterFirst.stockQuantity)).toBe(12); // 10 + 2 restocked

    // Second partial refund: same 2 units, DIFFERENT key (key-beta)
    // Must be processed independently, NOT rejected as duplicate.
    const res2 = buildRes();
    await saleController.processRefund(buildRefundReq(2, 'key-beta-' + Date.now()), res2);
    expect(res2.statusCode).toBe(200);
    expect(res2.body.isDuplicate).toBeFalsy();
    expect(res2.body.totalRefundAmount).toBe(200);

    const invAfterSecond = await Inventory.findOne({ where: { productId: prodA.id, shopId: shop.id } });
    expect(Number(invAfterSecond.stockQuantity)).toBe(14); // 12 + 2 restocked

    // Two distinct SaleRefund rows must exist
    const refundCount = await SaleRefund.count({ where: { saleId: sale.id } });
    expect(refundCount).toBe(2);
  });

  it('H-01: Ascending productId sort in createSaleInternal preserves item quantities, prices and discounts', async () => {
    // Submit items in REVERSE productId order (higher id first) to exercise the sort.
    // If the sort corrupts item data, quantities or prices will be wrong.
    //
    // Call createSaleInternal directly (it is exported) to avoid express-validator
    // context and the payment-method-enabled system-settings check in createSale.
    const salePayload = {
      // prodA has a higher id than prodB; submit them in REVERSE order to trigger the sort
      items: [
        { productId: prodA.id, quantity: 3, discount: 0 }, // 3 × 100 = 300
        { productId: prodB.id, quantity: 5, discount: 0 }  // 5 × 50  = 250
      ],
      paymentMethod: 'cash',
      paymentAmount: 550
    };
    const mockUser = { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id };

    // Read current inventory levels (affected by prior H-03 test)
    const invABefore = await Inventory.findOne({ where: { productId: prodA.id, shopId: shop.id } });
    const invBBefore = await Inventory.findOne({ where: { productId: prodB.id, shopId: shop.id } });
    const stockABefore = Number(invABefore.stockQuantity);
    const stockBBefore = Number(invBBefore.stockQuantity);

    const result = await saleController.createSaleInternal(salePayload, shop.id, mockUser, org2.id);
    expect(result).toBeTruthy();

    const saleId = result.id || result.sale?.id;
    expect(saleId).toBeTruthy();

    // Verify SaleItems: each product must retain its own quantity and subtotal — not swapped
    const saleItems = await SaleItem.findAll({ where: { saleId } });
    const itemA = saleItems.find(si => Number(si.productId) === prodA.id);
    const itemB = saleItems.find(si => Number(si.productId) === prodB.id);

    expect(itemA).toBeTruthy();
    expect(Number(itemA.quantity)).toBe(3);
    // gross subtotal = quantity × product.price = 3 × 100 = 300
    expect(Number(itemA.subtotal)).toBeCloseTo(300, 0);

    expect(itemB).toBeTruthy();
    expect(Number(itemB.quantity)).toBe(5);
    // gross subtotal = 5 × 50 = 250
    expect(Number(itemB.subtotal)).toBeCloseTo(250, 0);

    // Inventory must be decremented by the correct amount per product
    const invAAfter = await Inventory.findOne({ where: { productId: prodA.id, shopId: shop.id } });
    const invBAfter = await Inventory.findOne({ where: { productId: prodB.id, shopId: shop.id } });
    expect(Number(invAAfter.stockQuantity)).toBe(stockABefore - 3);
    expect(Number(invBAfter.stockQuantity)).toBe(stockBBefore - 5);
  });

  describe('Stage 3D.3 Refund Idempotency Verification Gate', () => {
    const { Op } = require('sequelize');
    const buildRes = () => ({
      statusCode: 200,
      body: null,
      status: jest.fn(function (c) { this.statusCode = c; return this; }),
      json: jest.fn(function (b) { this.body = b; return this; })
    });

    it('Stage 3D.3 - Requirement 1: Missing idempotency key is accepted with safe alternative (pessimistic lock & cumulative quantity validation)', async () => {
      const sale = await Sale.create({
        invoiceNumber: 'INV-3D3-NOKEY-' + Date.now(),
        shopId: shop.id,
        userId: testUser2.id,
        subtotal: 200.0,
        total: 200.0,
        paymentMethod: 'cash',
        paymentAmount: 200.0,
        saleStatus: 'completed',
        status: 'completed'
      });
      await SaleItem.create({
        saleId: sale.id,
        productId: prodB.id,
        quantity: 2,
        price: 50.0,
        unitPrice: 50.0,
        subtotal: 100.0,
        shopId: shop.id
      });
      await SalePayment.create({
        saleId: sale.id,
        shopId: shop.id,
        amount: 200.0,
        paymentMethod: 'cash',
        paymentReference: sale.invoiceNumber,
        status: 'completed'
      });

      const invBefore = await Inventory.findOne({ where: { productId: prodB.id, shopId: shop.id } });
      const initialStock = Number(invBefore.stockQuantity);

      // Refund without idempotency key
      const req1 = {
        params: { saleId: String(sale.id) },
        headers: {}, // No idempotency key
        body: { items: [{ productId: prodB.id, quantity: 1, disposition: 'restock', reasonCode: 'OTHER' }] },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      };
      const res1 = buildRes();
      await saleController.processRefund(req1, res1);

      expect(res1.statusCode).toBe(200);
      expect(res1.body.isDuplicate).toBeFalsy();
      expect(res1.body.totalRefundAmount).toBe(50);

      const invAfter1 = await Inventory.findOne({ where: { productId: prodB.id, shopId: shop.id } });
      expect(Number(invAfter1.stockQuantity)).toBe(initialStock + 1);

      // Attempting to refund 2 more units (only 1 remaining) must be rejected with 400
      const req2 = {
        params: { saleId: String(sale.id) },
        headers: {},
        body: { items: [{ productId: prodB.id, quantity: 2, disposition: 'restock', reasonCode: 'OTHER' }] },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      };
      const res2 = buildRes();
      await saleController.processRefund(req2, res2);

      expect(res2.statusCode).toBe(400);
      expect(res2.body.error).toMatch(/Only 1 units available for refund/i);
    });

    it('Stage 3D.3 - Requirement 2: Identical key and identical payload deduplicate without side effects', async () => {
      const sale = await Sale.create({
        invoiceNumber: 'INV-3D3-DEDUP-' + Date.now(),
        shopId: shop.id,
        userId: testUser2.id,
        subtotal: 300.0,
        total: 300.0,
        paymentMethod: 'cash',
        paymentAmount: 300.0,
        saleStatus: 'completed',
        status: 'completed'
      });
      await SaleItem.create({
        saleId: sale.id,
        productId: prodA.id,
        quantity: 3,
        price: 100.0,
        unitPrice: 100.0,
        subtotal: 300.0,
        shopId: shop.id
      });
      await SalePayment.create({
        saleId: sale.id,
        shopId: shop.id,
        amount: 300.0,
        paymentMethod: 'cash',
        paymentReference: sale.invoiceNumber,
        status: 'completed'
      });

      const invBefore = await Inventory.findOne({ where: { productId: prodA.id, shopId: shop.id } });
      const initialStock = Number(invBefore.stockQuantity);
      const testKey = 'key-3d3-dedup-' + Date.now();

      const makeReq = () => ({
        params: { saleId: String(sale.id) },
        headers: { 'idempotency-key': testKey },
        body: { items: [{ productId: prodA.id, quantity: 1, disposition: 'restock', reasonCode: 'OTHER' }] },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      });

      // First call
      const res1 = buildRes();
      await saleController.processRefund(makeReq(), res1);
      expect(res1.statusCode).toBe(200);
      expect(res1.body.isDuplicate).toBeFalsy();

      const invAfter1 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shop.id } });
      expect(Number(invAfter1.stockQuantity)).toBe(initialStock + 1);

      const refundCount1 = await SaleRefund.count({ where: { saleId: sale.id } });
      expect(refundCount1).toBe(1);

      const reversalCount1 = await SalePayment.count({
        where: { saleId: sale.id, amount: { [Op.lt]: 0 } }
      });
      expect(reversalCount1).toBe(1);

      // Second call (retry with SAME key and SAME payload)
      const res2 = buildRes();
      await saleController.processRefund(makeReq(), res2);
      expect(res2.statusCode).toBe(200);
      expect(res2.body.isDuplicate).toBe(true);

      // Verify ZERO additional side effects:
      const invAfter2 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shop.id } });
      expect(Number(invAfter2.stockQuantity)).toBe(initialStock + 1); // No double restock

      const refundCount2 = await SaleRefund.count({ where: { saleId: sale.id } });
      expect(refundCount2).toBe(1); // No double record

      const reversalCount2 = await SalePayment.count({
        where: { saleId: sale.id, amount: { [Op.lt]: 0 } }
      });
      expect(reversalCount2).toBe(1); // No double payment reversal
    });

    it('Stage 3D.3 - Requirement 3: Same key with different payload is rejected with 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const sale = await Sale.create({
        invoiceNumber: 'INV-3D3-MISMATCH-' + Date.now(),
        shopId: shop.id,
        userId: testUser2.id,
        subtotal: 400.0,
        total: 400.0,
        paymentMethod: 'cash',
        paymentAmount: 400.0,
        saleStatus: 'completed',
        status: 'completed'
      });
      await SaleItem.create({
        saleId: sale.id,
        productId: prodA.id,
        quantity: 4,
        price: 100.0,
        unitPrice: 100.0,
        subtotal: 400.0,
        shopId: shop.id
      });
      await SalePayment.create({
        saleId: sale.id,
        shopId: shop.id,
        amount: 400.0,
        paymentMethod: 'cash',
        paymentReference: sale.invoiceNumber,
        status: 'completed'
      });

      const testKey = 'key-3d3-mismatch-' + Date.now();

      // First call: refund 1 unit
      const res1 = buildRes();
      await saleController.processRefund({
        params: { saleId: String(sale.id) },
        headers: { 'idempotency-key': testKey },
        body: { items: [{ productId: prodA.id, quantity: 1, disposition: 'restock', reasonCode: 'OTHER' }] },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      }, res1);
      expect(res1.statusCode).toBe(200);

      // Second call: SAME key, DIFFERENT quantity (2 units)
      const res2 = buildRes();
      await saleController.processRefund({
        params: { saleId: String(sale.id) },
        headers: { 'idempotency-key': testKey },
        body: { items: [{ productId: prodA.id, quantity: 2, disposition: 'restock', reasonCode: 'OTHER' }] },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      }, res2);

      expect(res2.statusCode).toBe(409);
      expect(res2.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('Stage 3D.3 - Requirement 4: Invalid idempotency key format returns 400 Bad Request', async () => {
      const res = buildRes();
      await saleController.processRefund({
        params: { saleId: '999999' },
        body: {
          idempotencyKey: { invalid: 'must be string' },
          items: [{ productId: prodA.id, quantity: 1 }]
        },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      }, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/Invalid Idempotency-Key format/i);
    });

    it('Stage 3D.3 - Requirement 5: Aborted transaction cleanly rolls back and permits subsequent retry with the same key', async () => {
      // 1. Create a cancelled sale
      const cancelledSale = await Sale.create({
        invoiceNumber: 'INV-3D3-CANCELLED-' + Date.now(),
        shopId: shop.id,
        userId: testUser2.id,
        subtotal: 100.0,
        total: 100.0,
        paymentMethod: 'cash',
        paymentAmount: 100.0,
        saleStatus: 'cancelled',
        status: 'cancelled'
      });
      await SaleItem.create({
        saleId: cancelledSale.id,
        productId: prodA.id,
        quantity: 1,
        price: 100.0,
        unitPrice: 100.0,
        subtotal: 100.0,
        shopId: shop.id
      });

      const retryKey = 'key-3d3-retry-' + Date.now();

      // Call refund on cancelled sale: must fail inside transaction and rollback
      const resFail = buildRes();
      await saleController.processRefund({
        params: { saleId: String(cancelledSale.id) },
        headers: { 'idempotency-key': retryKey },
        body: { items: [{ productId: prodA.id, quantity: 1, disposition: 'restock', reasonCode: 'OTHER' }] },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      }, resFail);

      expect(resFail.statusCode).toBe(400);
      expect(resFail.body.error).toMatch(/Cannot process refund for a cancelled or deleted sale/i);

      // Verify that cancelledSale metadata does NOT store the key
      const reloadedCancelledSale = await Sale.findByPk(cancelledSale.id);
      expect(reloadedCancelledSale.metadata?.refundIdempotency?.[retryKey]).toBeUndefined();

      // 2. Now use the SAME retryKey on a valid completed sale: must succeed
      const validSale = await Sale.create({
        invoiceNumber: 'INV-3D3-VALID-' + Date.now(),
        shopId: shop.id,
        userId: testUser2.id,
        subtotal: 100.0,
        total: 100.0,
        paymentMethod: 'cash',
        paymentAmount: 100.0,
        saleStatus: 'completed',
        status: 'completed'
      });
      await SaleItem.create({
        saleId: validSale.id,
        productId: prodA.id,
        quantity: 1,
        price: 100.0,
        unitPrice: 100.0,
        subtotal: 100.0,
        shopId: shop.id
      });
      await SalePayment.create({
        saleId: validSale.id,
        shopId: shop.id,
        amount: 100.0,
        paymentMethod: 'cash',
        paymentReference: validSale.invoiceNumber,
        status: 'completed'
      });

      const resSuccess = buildRes();
      await saleController.processRefund({
        params: { saleId: String(validSale.id) },
        headers: { 'idempotency-key': retryKey },
        body: { items: [{ productId: prodA.id, quantity: 1, disposition: 'restock', reasonCode: 'OTHER' }] },
        user: { id: testUser2.id, role: 'admin', shopId: shop.id, organizationId: org2.id },
        shopId: shop.id,
        organizationId: org2.id
      }, resSuccess);

      expect(resSuccess.statusCode).toBe(200);
      expect(resSuccess.body.isDuplicate).toBeFalsy();

      const reloadedValidSale = await Sale.findByPk(validSale.id);
      expect(reloadedValidSale.metadata?.refundIdempotency?.[retryKey]).toBeDefined();
    });
  });
});
