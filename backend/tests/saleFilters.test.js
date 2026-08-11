const fs = require('fs');
const path = require('path');
const { NON_CANCELLED_SALE_FILTER } = require('../src/constants/saleFilters');
const { Sale, Shop, User, Customer } = require('../src/models');
const sequelize = require('../src/config/database');
const reportsController = require('../src/controllers/reportsController');
const dashboardController = require('../src/controllers/dashboardController');
const analyticsController = require('../src/controllers/analyticsController');

describe('Shared NON_CANCELLED_SALE_FILTER Verification', () => {
  test('Static Check: Controllers import NON_CANCELLED_SALE_FILTER from constants/saleFilters', () => {
    const controllersDir = path.join(__dirname, '../src/controllers');
    const targetControllers = [
      'reportsController.js',
      'dashboardController.js',
      'analyticsController.js',
      'insightsController.js',
      'customerController.js',
      'employeeController.js'
    ];

    targetControllers.forEach(file => {
      const content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
      expect(content).toContain("require('../constants/saleFilters')");
      expect(content).toContain('NON_CANCELLED_SALE_FILTER');
    });
  });

  test('Runtime Verification: Cancelled sales are excluded from reports & dashboard stats simultaneously', async () => {
    // Authenticate database
    await sequelize.authenticate();

    // 1. Create a test shop
    const shop = await Shop.create({
      name: `Test Shop ${Date.now()}`,
      address: 'Test Address'
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

    // 2. Create 1 completed sale (Total: 100) and 1 cancelled sale (Total: 500)
    const completedSale = await Sale.create({
      invoiceNumber: `INV-COMP-${Date.now()}`,
      subtotal: 100,
      tax: 0,
      total: 100,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: shop.id,
      userId: user.id,
      createdAt: new Date()
    });

    const cancelledSale = await Sale.create({
      invoiceNumber: `INV-CANC-${Date.now()}`,
      subtotal: 500,
      tax: 0,
      total: 500,
      paymentMethod: 'cash',
      saleStatus: 'cancelled',
      shopId: shop.id,
      userId: user.id,
      createdAt: new Date()
    });

    // 3. Test reportsController.getSalesSummary
    const resSummary = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    await reportsController.getSalesSummary(req, resSummary);
    expect(resSummary.json).toHaveBeenCalled();
    const summaryData = resSummary.json.mock.calls[0][0];
    expect(summaryData.kpis.totalRevenue).toBe(100);
    expect(summaryData.kpis.totalSales).toBe(1);

    // 4. Test dashboardController.getStats
    const resStats = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    await dashboardController.getStats(req, resStats);
    expect(resStats.json).toHaveBeenCalled();
    const statsData = resStats.json.mock.calls[0][0];
    expect(statsData.totalIncome).toBe(100);
    expect(statsData.totalSales).toBe(1);

    // Clean up test records
    await Sale.destroy({ where: { shopId: shop.id } });
    await User.destroy({ where: { id: user.id } });
    await Shop.destroy({ where: { id: shop.id } });
  });
});
