const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const {
  NON_CANCELLED_SALE_FILTER,
  REALIZED_SALE_FILTER,
  withSaleFilter
} = require('../src/constants/saleFilters');
const { Sale, SaleItem, SaleRefund, Product, Shop, User, Customer } = require('../src/models');
const sequelize = require('../src/config/database');
const reportsController = require('../src/controllers/reportsController');
const dashboardController = require('../src/controllers/dashboardController');
const analyticsController = require('../src/controllers/analyticsController');
const saleController = require('../src/controllers/saleController');

describe('Shared NON_CANCELLED_SALE_FILTER Verification', () => {
  test('Static Check: Controllers import NON_CANCELLED_SALE_FILTER from constants/saleFilters', () => {
    const controllersDir = path.join(__dirname, '../src/controllers');
    const targetControllers = [
      'reportsController.js',
      'dashboardController.js',
      'analyticsController.js',
      'insightsController.js',
      'customerController.js',
      'employeeController.js',
      'saleController.js'
    ];

    targetControllers.forEach(file => {
      const content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
      expect(content).toContain("constants/saleFilters");
      expect(content).toMatch(/NON_CANCELLED_SALE_FILTER|REALIZED_SALE_FILTER/);
    });
  });

  test('F-2: withSaleFilter safely composes baseWhere containing [Op.or] and [Op.and] with REALIZED_SALE_FILTER and NON_CANCELLED_SALE_FILTER without clobbering symbol keys', async () => {
    await sequelize.authenticate();

    const shop = await Shop.create({
      name: `Filter Compose Shop ${Date.now()}`,
      address: 'Compose Address',
      organizationId: 1
    });

    const user1 = await User.create({
      name: 'Compose User 1',
      email: `compose_u1_${Date.now()}@test.com`,
      password: 'password123',
      role: 'cashier',
      shopId: shop.id
    });

    const user2 = await User.create({
      name: 'Compose User 2',
      email: `compose_u2_${Date.now()}@test.com`,
      password: 'password123',
      role: 'cashier',
      shopId: shop.id
    });

    try {
      // Sale 1: user1, completed (should match)
      await Sale.create({
        invoiceNumber: `INV-F2-1-${Date.now()}`,
        subtotal: 100,
        total: 100,
        paymentAmount: 100,
        paymentMethod: 'cash',
        status: 'completed',
        saleStatus: 'completed',
        shopId: shop.id,
        userId: user1.id
      });

      // Sale 2: user1, legacy status='cancelled' but saleStatus='completed' (must be excluded!)
      await Sale.create({
        invoiceNumber: `INV-F2-2-${Date.now()}`,
        subtotal: 200,
        total: 200,
        paymentAmount: 200,
        paymentMethod: 'cash',
        status: 'cancelled',
        saleStatus: 'completed',
        shopId: shop.id,
        userId: user1.id
      });

      // Sale 3: user2, completed (must be excluded when filtering for user1 via [Op.or])
      await Sale.create({
        invoiceNumber: `INV-F2-3-${Date.now()}`,
        subtotal: 300,
        total: 300,
        paymentAmount: 300,
        paymentMethod: 'cash',
        status: 'completed',
        saleStatus: 'completed',
        shopId: shop.id,
        userId: user2.id
      });

      // Compose a baseWhere that already uses [Op.or] AND [Op.and]
      const baseWhere = {
        shopId: shop.id,
        [Op.or]: [{ userId: user1.id }, { employeeId: String(user1.id) }],
        [Op.and]: [{ total: { [Op.gt]: 0 } }]
      };

      const composedRealized = withSaleFilter(baseWhere, REALIZED_SALE_FILTER);
      const composedNonCancelled = withSaleFilter(baseWhere, NON_CANCELLED_SALE_FILTER);

      const rowsRealized = await Sale.findAll({ where: composedRealized });
      const rowsNonCancelled = await Sale.findAll({ where: composedNonCancelled });

      expect(rowsRealized).toHaveLength(1);
      expect(Number(rowsRealized[0].total)).toBe(100);
      expect(rowsNonCancelled).toHaveLength(1);
      expect(Number(rowsNonCancelled[0].total)).toBe(100);
    } finally {
      await Sale.destroy({ where: { shopId: shop.id } });
      await User.destroy({ where: { id: [user1.id, user2.id] } });
      await Shop.destroy({ where: { id: shop.id } });
    }
  });

  test('Runtime Verification: Cancelled sales are excluded from reports & dashboard stats simultaneously', async () => {
    await sequelize.authenticate();

    const shop = await Shop.create({
      name: `Test Shop ${Date.now()}`,
      address: 'Test Address',
      organizationId: 1
    });

    const user = await User.create({
      name: 'Test Admin',
      email: `admin_${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: shop.id
    });

    const req = {
      user: { id: user.id, role: 'admin', shopId: shop.id },
      shopId: shop.id,
      query: {}
    };

    try {
      await Sale.create({
        invoiceNumber: `INV-COMP-${Date.now()}`,
        subtotal: 100,
        tax: 0,
        total: 100,
        paymentAmount: 100,
        paymentMethod: 'cash',
        saleStatus: 'completed',
        shopId: shop.id,
        userId: user.id,
        createdAt: new Date()
      });

      await Sale.create({
        invoiceNumber: `INV-CANC-${Date.now()}`,
        subtotal: 500,
        tax: 0,
        total: 500,
        paymentAmount: 500,
        paymentMethod: 'cash',
        saleStatus: 'cancelled',
        shopId: shop.id,
        userId: user.id,
        createdAt: new Date()
      });

      const resSummary = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      await reportsController.getSalesSummary(req, resSummary);
      expect(resSummary.json).toHaveBeenCalled();
      const summaryData = resSummary.json.mock.calls[0][0];
      expect(summaryData.kpis.totalRevenue).toBe(100);
      expect(summaryData.kpis.totalSales).toBe(1);

      const resStats = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };
      await dashboardController.getStats(req, resStats);
      expect(resStats.json).toHaveBeenCalled();
      const statsData = resStats.json.mock.calls[0][0];
      expect(Number(statsData.totalIncome)).toBe(100);
      expect(statsData.totalSales).toBe(1);
    } finally {
      await Sale.destroy({ where: { shopId: shop.id } });
      await User.destroy({ where: { id: user.id } });
      await Shop.destroy({ where: { id: shop.id } });
    }
  });

  test('F-1 & F-9: analyticsController (getVisitors, getOrderTracking, getTopProducts) and saleController (getCashierStats, getSalesStatistics) enforce full realized-sale truth table, net partial refunds, and tenant isolation', async () => {
    await sequelize.authenticate();

    const shop = await Shop.create({
      name: `Analytics Audit Shop ${Date.now()}`,
      address: 'Analytics Address',
      organizationId: 1
    });
    const foreignShop = await Shop.create({
      name: `Foreign Shop ${Date.now()}`,
      address: 'Foreign Address',
      organizationId: 1
    });

    const user = await User.create({
      name: 'Analytics Cashier',
      email: `analytics_cashier_${Date.now()}@test.com`,
      password: 'password123',
      role: 'cashier',
      shopId: shop.id
    });

    const prod = await Product.create({
      name: 'Analytics Widget',
      sku: `AN-WID-${Date.now()}`,
      price: 100,
      cost: 50,
      shopId: shop.id,
      organizationId: 1,
      active: true
    });

    try {
      const now = new Date();

      // 1. Completed sale: 2 units @ 100 = 200 (INCLUDED: +1 order, +200 rev, +2 units)
      const sCompleted = await Sale.create({
        invoiceNumber: `INV-AN-COMP-${Date.now()}`,
        subtotal: 200,
        total: 200,
        paymentAmount: 200,
        paymentMethod: 'cash',
        status: 'completed',
        saleStatus: 'completed',
        shopId: shop.id,
        userId: user.id,
        createdAt: now
      });
      await SaleItem.create({
        saleId: sCompleted.id,
        productId: prod.id,
        quantity: 2,
        price: 100,
        unitPrice: 100,
        subtotal: 200,
        shopId: shop.id
      });

      // 2. Partial refund sale: 3 units @ 100 = 300, 1 unit refunded = 100 (INCLUDED: +1 order, +200 net rev, +2 net units)
      const sPartial = await Sale.create({
        invoiceNumber: `INV-AN-PART-${Date.now()}`,
        subtotal: 300,
        total: 300,
        paymentAmount: 300,
        paymentMethod: 'cash',
        status: 'completed',
        saleStatus: 'partial_refund',
        shopId: shop.id,
        userId: user.id,
        createdAt: now
      });
      await SaleItem.create({
        saleId: sPartial.id,
        productId: prod.id,
        quantity: 3,
        price: 100,
        unitPrice: 100,
        subtotal: 300,
        shopId: shop.id
      });
      await SaleRefund.create({
        saleId: sPartial.id,
        productId: prod.id,
        quantity: 1,
        amount: 100,
        refundAmount: 100,
        status: 'processed',
        shopId: shop.id
      });

      // 3. Fully refunded sale (EXCLUDED)
      const sRefunded = await Sale.create({
        invoiceNumber: `INV-AN-REF-${Date.now()}`,
        subtotal: 400,
        total: 400,
        paymentAmount: 400,
        paymentMethod: 'cash',
        status: 'completed',
        saleStatus: 'refunded',
        shopId: shop.id,
        userId: user.id,
        createdAt: now
      });
      await SaleItem.create({
        saleId: sRefunded.id,
        productId: prod.id,
        quantity: 4,
        price: 100,
        unitPrice: 100,
        subtotal: 400,
        shopId: shop.id
      });

      // 4. Conflicting status: status='cancelled', saleStatus='completed' (EXCLUDED)
      const sLegacyCancel = await Sale.create({
        invoiceNumber: `INV-AN-LEGCANC-${Date.now()}`,
        subtotal: 500,
        total: 500,
        paymentAmount: 500,
        paymentMethod: 'cash',
        status: 'cancelled',
        saleStatus: 'completed',
        shopId: shop.id,
        userId: user.id,
        createdAt: now
      });
      await SaleItem.create({
        saleId: sLegacyCancel.id,
        productId: prod.id,
        quantity: 5,
        price: 100,
        unitPrice: 100,
        subtotal: 500,
        shopId: shop.id
      });

      // 5. Pending sale: saleStatus='pending', status='completed' (EXCLUDED)
      await Sale.create({
        invoiceNumber: `INV-AN-PEND-${Date.now()}`,
        subtotal: 600,
        total: 600,
        paymentAmount: 600,
        paymentMethod: 'cash',
        status: 'completed',
        saleStatus: 'pending',
        shopId: shop.id,
        userId: user.id,
        createdAt: now
      });

      // 6. Failed fulfillment sale: fulfillmentStatus='failed' (EXCLUDED)
      await Sale.create({
        invoiceNumber: `INV-AN-FAIL-${Date.now()}`,
        subtotal: 700,
        total: 700,
        paymentAmount: 700,
        paymentMethod: 'cash',
        status: 'completed',
        saleStatus: 'completed',
        fulfillmentStatus: 'failed',
        shopId: shop.id,
        userId: user.id,
        createdAt: now
      });

      // Verify analyticsController.getVisitors -> totalVisitors = 2 (completed + partial_refund)
      const reqAn = {
        user: { id: user.id, role: 'cashier', shopId: shop.id },
        shopId: shop.id,
        query: { period: 'week' }
      };
      const resVisitors = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await analyticsController.getVisitors(reqAn, resVisitors);
      expect(resVisitors.json.mock.calls[0][0].totalVisitors).toBe(2);

      // Verify analyticsController.getOrderTracking -> totalOrders = 2, totalRevenue = 400 (200 + 200 net)
      const resOrders = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await analyticsController.getOrderTracking(reqAn, resOrders);
      expect(resOrders.json.mock.calls[0][0].totalOrders).toBe(2);
      expect(resOrders.json.mock.calls[0][0].totalRevenue).toBe(400);

      // Verify analyticsController.getTopProducts -> quantity = 4 (2 + (3 - 1)), revenue = 400
      const resTop = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await analyticsController.getTopProducts(reqAn, resTop);
      const topPayload = resTop.json.mock.calls[0][0];
      expect(topPayload.totalSales).toBe(4);
      expect(topPayload.products).toHaveLength(1);
      expect(topPayload.products[0].quantity).toBe(4);
      expect(topPayload.products[0].revenue).toBe(400);

      // Verify saleController.getCashierStats -> period.orderCount = 2, period.totalSales = 400, today.itemCount = 4
      const resCashier = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await saleController.getCashierStats(reqAn, resCashier);
      const cashierPayload = resCashier.json.mock.calls[0][0];
      expect(cashierPayload.period.orderCount).toBe(2);
      expect(cashierPayload.period.totalSales).toBe(400);
      expect(cashierPayload.today.itemCount).toBe(4);

      // Verify saleController.getSalesStatistics -> totalSales = 2, totalRevenue = 400, averageTicket = 200
      const resSaleStats = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await saleController.getSalesStatistics(reqAn, resSaleStats);
      const saleStatsPayload = resSaleStats.json.mock.calls[0][0];
      expect(saleStatsPayload.totalSales).toBe(2);
      expect(saleStatsPayload.totalRevenue).toBe(400);
      expect(saleStatsPayload.averageTicket).toBe(200);

      // Verify F-9: analyticsController rejects unauthorized cross-shop query.shopId with 403
      const reqCrossShop = {
        user: { id: user.id, role: 'cashier', shopId: shop.id },
        shopId: shop.id,
        query: { period: 'week', shopId: String(foreignShop.id) }
      };
      const resCrossShop = { json: jest.fn(), status: jest.fn().mockReturnThis() };
      await analyticsController.getVisitors(reqCrossShop, resCrossShop);
      expect(resCrossShop.status).toHaveBeenCalledWith(403);
    } finally {
      await SaleRefund.destroy({ where: { shopId: shop.id } });
      await SaleItem.destroy({ where: { shopId: shop.id } });
      await Sale.destroy({ where: { shopId: shop.id } });
      await Product.destroy({ where: { id: prod.id } });
      await User.destroy({ where: { id: user.id } });
      await Shop.destroy({ where: { id: [shop.id, foreignShop.id] } });
    }
  });
});

// ---------------------------------------------------------------------------
// L-01 & L-02 Regression: NULL status and legacy 'partially_refunded' enum
// ---------------------------------------------------------------------------
describe('REALIZED_SALE_FILTER edge cases: NULL saleStatus and legacy partially_refunded enum', () => {
  test('L-01: REALIZED_SALE_FILTER and buildRealizedSaleSqlCondition correctly handle NULL status fields for legacy compatibility', async () => {
    // 1. Structural checks: both ORM and SQL must include saleStatus = null / IS NULL
    const { REALIZED_SALE_FILTER: RSF, buildRealizedSaleSqlCondition } = require('../src/constants/saleFilters');
    const { Op, literal } = require('sequelize');

    const orClause = RSF[Op.and][0][Op.or];
    const includesSaleStatusNull = orClause.some(c => c.saleStatus === null);
    expect(includesSaleStatusNull).toBe(true);

    const statusOrClause = RSF[Op.and][1][Op.or];
    const includesStatusNull = statusOrClause.some(c => c.status === null);
    expect(includesStatusNull).toBe(true);

    const sqlCond = buildRealizedSaleSqlCondition('Sale');
    expect(sqlCond).toContain('saleStatus IS NULL');
    expect(sqlCond).toContain('status IS NULL');

    // 2. Database evaluation: legacy sale where status column is NULL (legacy record)
    await sequelize.authenticate();
    const shop = await Shop.create({
      name: `Null Status Shop ${Date.now()}`,
      address: 'Null Addr',
      organizationId: 1
    });
    const user = await User.create({
      name: 'Null Status User',
      email: `null_status_${Date.now()}@test.com`,
      password: 'password123',
      role: 'cashier',
      shopId: shop.id
    });

    const sLegacyStatusNull = await Sale.create({
      invoiceNumber: `INV-LEG-NULL-${Date.now()}`,
      subtotal: 100,
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash',
      status: null,
      saleStatus: 'completed',
      shopId: shop.id,
      userId: user.id
    });

    try {
      // Both ORM and raw SQL must realize this sale
      const ormSales = await Sale.findAll({
        where: { shopId: shop.id, ...RSF }
      });
      expect(ormSales.map(s => s.id)).toContain(sLegacyStatusNull.id);

      const rawSales = await Sale.findAll({
        where: {
          shopId: shop.id,
          [Op.and]: [literal(sqlCond)]
        }
      });
      expect(rawSales.map(s => s.id)).toContain(sLegacyStatusNull.id);
      expect(ormSales.length).toBe(rawSales.length);
    } finally {
      await Sale.destroy({ where: { shopId: shop.id } });
      await User.destroy({ where: { id: user.id } });
      await Shop.destroy({ where: { id: shop.id } });
    }
  });

  test('L-02: REALIZED_SALE_FILTER and buildRealizedSaleSqlCondition both include "partially_refunded" in their allowed-status sets', () => {
    // This is a structural/code-level test. The test-DB ENUM column may not yet include
    // 'partially_refunded' (it requires a migration not run here). Instead we verify the
    // filter constants reference the value correctly, which is the directly auditable risk.
    const { REALIZED_SALE_FILTER: RSF, buildRealizedSaleSqlCondition } = require('../src/constants/saleFilters');
    const { Op } = require('sequelize');

    // ORM filter: Op.in list must contain both partial-refund variants
    const ormOrClause = RSF[Op.and][0][Op.or];
    const ormInList = ormOrClause.find(c => c.saleStatus?.[Op.in])?.saleStatus?.[Op.in] || [];
    expect(ormInList).toContain('partially_refunded');
    expect(ormInList).toContain('partial_refund');
    expect(ormInList).toContain('completed');
    // refunded (fully refunded, net-$0) must NOT be in the realized set
    expect(ormInList).not.toContain('refunded');
    expect(ormInList).not.toContain('cancelled');

    // Raw SQL condition string must also reference both variants
    const sqlCond = buildRealizedSaleSqlCondition('Sale');
    expect(sqlCond).toContain("'partially_refunded'");
    expect(sqlCond).toContain("'partial_refund'");
    expect(sqlCond).toContain("'completed'");
    expect(sqlCond).not.toMatch(/'refunded'(?!_)/); // 'refunded' alone, not as part of 'partially_refunded'
  });
});
