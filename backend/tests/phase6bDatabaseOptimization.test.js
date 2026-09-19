const request = require('supertest');
const app = require('../src/app');
const db = require('../src/models');
const { Organization, Shop, User, Employee, Product, Category, Inventory, Sale, SaleRefund, sequelize } = db;
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

function getPrivateKey() {
  return process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
}

function tokenFor(payload) {
  const privateKey = getPrivateKey();
  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 6B-04: Database Indexing, Query Performance & Migration Hygiene', () => {
  let org;
  let shop;
  let user;
  let userToken;

  beforeAll(async () => {
    const ts = Date.now() + '-' + Math.floor(Math.random() * 100000);
    // Setup test tenant
    org = await Organization.create({
      name: `Phase6B04 Org ${ts}`,
      slug: `p6b04-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shop = await Shop.create({
      name: `Phase6B04 Shop ${ts}`,
      organizationId: org.id,
      active: true
    });

    user = await User.create({
      name: 'P6B04 Manager',
      email: `p6b04_user_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id
    });

    userToken = tokenFor({
      id: user.id,
      email: user.email,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });
  });

  afterAll(async () => {
    try {
      if (user) await User.destroy({ where: { id: user.id } });
      if (shop) await Shop.destroy({ where: { id: shop.id } });
      if (org) await Organization.destroy({ where: { id: org.id } });
    } catch (e) {
      // Ignore cleanup error
    }
  });

  describe('Objective A: Database Index Verification', () => {
    test('1. Employees table has idx_employees_shop_createdAt composite index', async () => {
      const [indexes] = await sequelize.query("SHOW INDEX FROM Employees WHERE Key_name = 'idx_employees_shop_createdAt'");
      expect(indexes.length).toBe(2);
      expect(indexes[0].Column_name).toBe('shopId');
      expect(indexes[0].Seq_in_index).toBe(1);
      expect(indexes[1].Column_name).toBe('createdAt');
      expect(indexes[1].Seq_in_index).toBe(2);
    });

    test('2. SaleRefunds table has idx_sale_refunds_shop_createdAt composite index', async () => {
      const [indexes] = await sequelize.query("SHOW INDEX FROM SaleRefunds WHERE Key_name = 'idx_sale_refunds_shop_createdAt'");
      expect(indexes.length).toBe(2);
      expect(indexes[0].Column_name).toBe('shopId');
      expect(indexes[0].Seq_in_index).toBe(1);
      expect(indexes[1].Column_name).toBe('createdAt');
      expect(indexes[1].Seq_in_index).toBe(2);
    });

    test('3. Invoices table has idx_invoices_shop_createdAt composite index', async () => {
      const [indexes] = await sequelize.query("SHOW INDEX FROM Invoices WHERE Key_name = 'idx_invoices_shop_createdAt'");
      expect(indexes.length).toBe(2);
      expect(indexes[0].Column_name).toBe('shopId');
      expect(indexes[0].Seq_in_index).toBe(1);
      expect(indexes[1].Column_name).toBe('createdAt');
      expect(indexes[1].Seq_in_index).toBe(2);
    });

    test('4. StockMovements table has idx_stockmovements_org_createdAt composite index', async () => {
      const [indexes] = await sequelize.query("SHOW INDEX FROM StockMovements WHERE Key_name = 'idx_stockmovements_org_createdAt'");
      expect(indexes.length).toBe(2);
      expect(indexes[0].Column_name).toBe('organizationId');
      expect(indexes[0].Seq_in_index).toBe(1);
      expect(indexes[1].Column_name).toBe('createdAt');
      expect(indexes[1].Seq_in_index).toBe(2);
    });

    test('5. SaleRefunds table has idx_sale_refunds_product_id index', async () => {
      const [indexes] = await sequelize.query("SHOW INDEX FROM SaleRefunds WHERE Key_name = 'idx_sale_refunds_product_id'");
      expect(indexes.length).toBe(1);
      expect(indexes[0].Column_name).toBe('productId');
    });

    test('6. Duplicate indexes removed from SaleItems', async () => {
      const [pIdx] = await sequelize.query("SHOW INDEX FROM SaleItems WHERE Key_name = 'idx_saleItems_productId'");
      const [sIdx] = await sequelize.query("SHOW INDEX FROM SaleItems WHERE Key_name = 'idx_saleItems_saleId'");
      expect(pIdx.length).toBe(0);
      expect(sIdx.length).toBe(0);

      // Verify canonical retained
      const [canonP] = await sequelize.query("SHOW INDEX FROM SaleItems WHERE Key_name = 'idx_sale_items_product_id'");
      const [canonS] = await sequelize.query("SHOW INDEX FROM SaleItems WHERE Key_name = 'idx_sale_items_sale_id'");
      expect(canonP.length).toBeGreaterThan(0);
      expect(canonS.length).toBeGreaterThan(0);
    });

    test('7. Duplicate employeeId index removed from Invoices', async () => {
      const [dupIdx] = await sequelize.query("SHOW INDEX FROM Invoices WHERE Key_name = 'invoices_employee_id'");
      expect(dupIdx.length).toBe(0);

      // Canonical retained
      const [canonIdx] = await sequelize.query("SHOW INDEX FROM Invoices WHERE Key_name = 'idx_invoices_employee_id'");
      expect(canonIdx.length).toBeGreaterThan(0);
    });

    test('8. Duplicate non-unique index removed from PendingPayments', async () => {
      const [dupIdx] = await sequelize.query("SHOW INDEX FROM PendingPayments WHERE Key_name = 'pending_payments_checkout_request_id'");
      expect(dupIdx.length).toBe(0);

      // Unique retained
      const [uniqIdx] = await sequelize.query("SHOW INDEX FROM PendingPayments WHERE Key_name = 'checkoutRequestId'");
      expect(uniqIdx.length).toBeGreaterThan(0);
      expect(uniqIdx[0].Non_unique).toBe(0);
    });

    test('9. Redundant single-column index removed from Products', async () => {
      const [dupIdx] = await sequelize.query("SHOW INDEX FROM Products WHERE Key_name = 'idx_products_shop_stockQuantity'");
      expect(dupIdx.length).toBe(0);

      // Canonical retained
      const [canonIdx] = await sequelize.query("SHOW INDEX FROM Products WHERE Key_name = 'idx_products_shop_id'");
      expect(canonIdx.length).toBeGreaterThan(0);
    });
  });

  describe('Objective B: EXPLAIN Query Optimization Plans', () => {
    test('10. EXPLAIN on Employees uses idx_employees_shop_createdAt (ref instead of ALL)', async () => {
      const [plan] = await sequelize.query('EXPLAIN SELECT * FROM Employees WHERE shopId = 1 ORDER BY createdAt DESC');
      expect(plan[0].key).toBe('idx_employees_shop_createdAt');
      expect(plan[0].type).toBe('ref');
      expect(plan[0].Extra).toContain('Backward index scan');
    });

    test('11. EXPLAIN on SaleRefunds uses idx_sale_refunds_shop_createdAt (ref instead of ALL)', async () => {
      const [plan] = await sequelize.query('EXPLAIN SELECT * FROM SaleRefunds WHERE shopId = 1 ORDER BY createdAt DESC');
      expect(plan[0].key).toBe('idx_sale_refunds_shop_createdAt');
      expect(plan[0].type).toBe('ref');
      expect(plan[0].Extra).toContain('Backward index scan');
    });

    test('12. EXPLAIN on Invoices uses idx_invoices_shop_createdAt without filesort', async () => {
      const [plan] = await sequelize.query('EXPLAIN SELECT * FROM Invoices WHERE shopId = 1 ORDER BY createdAt DESC LIMIT 20');
      expect(plan[0].key).toBe('idx_invoices_shop_createdAt');
      expect(plan[0].Extra).not.toContain('Using filesort');
      expect(plan[0].Extra).toContain('Backward index scan');
    });

    test('13. EXPLAIN on StockMovements uses idx_stockmovements_org_createdAt without filesort', async () => {
      const [plan] = await sequelize.query('EXPLAIN SELECT * FROM StockMovements WHERE organizationId = 1 ORDER BY createdAt DESC LIMIT 50');
      expect(plan[0].key).toBe('idx_stockmovements_org_createdAt');
      expect(plan[0].Extra).not.toContain('Using filesort');
      expect(plan[0].Extra).toContain('Backward index scan');
    });
  });

  describe('PAGE-01 & PAGE-02: Bounded Pagination & Cache Optimizations', () => {
    test('14. GET /api/sales/returns/all returns an Array with bounded pagination headers', async () => {
      const res = await request(app)
        .get('/api/sales/returns/all')
        .set('Authorization', userToken);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.headers['x-total-count']).toBeDefined();
      expect(res.headers['x-page']).toBe('1');
      expect(res.headers['x-limit']).toBe('50');
      expect(res.headers['x-total-pages']).toBeDefined();
    });

    test('15. GET /api/sales/returns/all honors custom limit and page and caps max at 100', async () => {
      const res1 = await request(app)
        .get('/api/sales/returns/all?page=2&limit=10')
        .set('Authorization', userToken);

      expect(res1.status).toBe(200);
      expect(res1.headers['x-page']).toBe('2');
      expect(res1.headers['x-limit']).toBe('10');

      // Cap at 100
      const res2 = await request(app)
        .get('/api/sales/returns/all?limit=5000')
        .set('Authorization', userToken);

      expect(res2.status).toBe(200);
      expect(res2.headers['x-limit']).toBe('100');
    });

    test('16. GET /api/sales/returns/all?format=paginated returns structured pagination envelope', async () => {
      const res = await request(app)
        .get('/api/sales/returns/all?format=paginated')
        .set('Authorization', userToken);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(50);
    });

    test('17. GET /api/products returns paginated products without unbounded catalog load', async () => {
      const res = await request(app)
        .get('/api/products?page=1&pageSize=12')
        .set('Authorization', userToken);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('products');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination.currentPage).toBe(1);
      expect(res.body.searchType).toBe('exact');
    });
  });
});
