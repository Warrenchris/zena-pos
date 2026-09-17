'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Category,
  Product,
  Inventory,
  StockMovement
} = require('../src/models');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 4: Multi-Branch Product & Inventory Integrity Suite', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let userA1, userB1;
  let empA1;
  let tokenA1, tokenA2, tokenB1, tokenEmpA1;

  beforeAll(async () => {
    await sequelize.authenticate();
  }, 30000);

  beforeEach(async () => {
    const ts = Date.now();

    // 1. Setup Tenant A with 2 branches (Shop A1 and Shop A2)
    orgA = await Organization.create({
      name: `Tenant A ${ts}`,
      slug: `tenant-a-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopA1 = await Shop.create({
      name: `Shop A1 Main ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 Branch ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    // 2. Setup Tenant B with 1 branch (Shop B1)
    orgB = await Organization.create({
      name: `Tenant B ${ts}`,
      slug: `tenant-b-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopB1 = await Shop.create({
      name: `Shop B1 ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // 3. Setup Users
    userA1 = await User.create({
      name: 'Owner A',
      email: `owner_a_${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      active: true
    });

    userB1 = await User.create({
      name: 'Owner B',
      email: `owner_b_${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB1.id,
      active: true
    });

    // Memberships
    const memA = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: userA1.id,
      orgRole: 'owner',
      status: 'active'
    });
    await ShopAccess.create({ membershipId: memA.id, shopId: shopA1.id });
    await ShopAccess.create({ membershipId: memA.id, shopId: shopA2.id });

    const memB = await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: userB1.id,
      orgRole: 'owner',
      status: 'active'
    });
    await ShopAccess.create({ membershipId: memB.id, shopId: shopB1.id });

    // 4. Setup Employee in Tenant A, Shop A1
    empA1 = await Employee.create({
      firstName: 'Cashier',
      lastName: 'A',
      email: `cashier_a_${ts}@test.com`,
      password: 'Password123!',
      position: 'cashier',
      shopId: shopA1.id,
      status: 'active',
      salary: 15000
    });

    const empMemA = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: empA1.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({ membershipId: empMemA.id, shopId: shopA1.id });

    // Tokens
    tokenA1 = tokenFor({
      id: userA1.id,
      email: userA1.email,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    tokenA2 = tokenFor({
      id: userA1.id,
      email: userA1.email,
      role: 'admin',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    tokenB1 = tokenFor({
      id: userB1.id,
      email: userB1.email,
      role: 'admin',
      shopId: shopB1.id,
      organizationId: orgB.id,
      isEmployee: false
    });

    tokenEmpA1 = tokenFor({
      id: empA1.id,
      email: empA1.email,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: true
    });
  }, 30000);

  afterAll(async () => {
    // Teardown connections if needed
  });

  // ==========================================
  // Test 1: Multi-branch SKU (P0-01, ISO-02)
  // ==========================================
  test('Test 1: Multi-branch SKU auto-generation counts organization-wide and avoids collision', async () => {
    // Create Category in Org A
    const cat = await Category.create({
      name: `Electronics ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    // 1. Create product in Branch A1 without SKU (auto-generated)
    const res1 = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Item In Branch A1',
        price: 100,
        cost: 60,
        categoryId: cat.id
      })
      .expect(201);

    expect(res1.body.sku).toBeDefined();

    // 2. Create product in Branch A2 without SKU (auto-generated)
    const res2 = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA2)
      .send({
        name: 'Item In Branch A2',
        price: 150,
        cost: 90,
        categoryId: cat.id
      })
      .expect(201);

    expect(res2.body.sku).toBeDefined();
    // SKUs must be unique and distinct
    expect(res2.body.sku).not.toBe(res1.body.sku);
  });

  // ==========================================
  // Test 2: Concurrent SKU creation (P0-02)
  // ==========================================
  test('Test 2: Concurrent product creation without explicit SKUs completes successfully', async () => {
    const cat = await Category.create({
      name: `Groceries ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    // Fire 3 concurrent creation requests simultaneously
    const requests = [1, 2, 3].map(i =>
      request(app)
        .post('/api/products')
        .set('Authorization', tokenA1)
        .send({
          name: `Concurrent Item ${i} ${Date.now()}`,
          price: 50 * i,
          cost: 25 * i,
          categoryId: cat.id
        })
    );

    const responses = await Promise.all(requests);
    responses.forEach(res => {
      expect(res.status).toBe(201);
      expect(res.body.sku).toBeDefined();
    });

    const skus = responses.map(r => r.body.sku);
    const uniqueSkus = new Set(skus);
    expect(uniqueSkus.size).toBe(3);
  });

  // ==========================================
  // Test 3: Cross-tenant category name independence (P0-03)
  // ==========================================
  test('Test 3: Different tenants can create categories with the exact same name', async () => {
    const sharedName = `Beverages ${Date.now()}`;

    // Tenant A creates "Beverages"
    const resA = await request(app)
      .post('/api/categories')
      .set('Authorization', tokenA1)
      .send({
        name: sharedName,
        description: 'Tenant A beverages'
      })
      .expect(201);

    expect(resA.body.name).toBe(sharedName);
    expect(resA.body.organizationId).toBe(orgA.id);

    // Tenant B creates "Beverages" with same name
    const resB = await request(app)
      .post('/api/categories')
      .set('Authorization', tokenB1)
      .send({
        name: sharedName,
        description: 'Tenant B beverages'
      })
      .expect(201);

    expect(resB.body.name).toBe(sharedName);
    expect(resB.body.organizationId).toBe(orgB.id);

    // However, Tenant A creating the same name again should fail
    const dupRes = await request(app)
      .post('/api/categories')
      .set('Authorization', tokenA1)
      .send({
        name: sharedName,
        description: 'Duplicate in same org'
      })
      .expect(400);

    expect(dupRes.body.error).toMatch(/already exists/i);
  });

  // ==========================================
  // Test 4: Cross-tenant category assignment rejection (P1-03)
  // ==========================================
  test('Test 4: Product creation rejects category belonging to another tenant', async () => {
    // Category belonging to Tenant B
    const catB = await Category.create({
      name: `Tenant B Cat ${Date.now()}`,
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true
    });

    // Tenant A tries to use Tenant B's category
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Malicious Product',
        price: 200,
        cost: 100,
        categoryId: catB.id
      })
      .expect(400);

    expect(res.body.error).toMatch(/Invalid category for organization/i);
  });

  // ==========================================
  // Test 5: Cross-branch category visibility (P1-01)
  // ==========================================
  test('Test 5: Categories created in Branch A1 are visible to Branch A2 in same tenant', async () => {
    const cat = await Category.create({
      name: `Shared Category ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    // Branch A2 fetches categories
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', tokenA2)
      .expect(200);

    const found = res.body.find(c => c.id === cat.id);
    expect(found).toBeDefined();
    expect(found.name).toBe(cat.name);
  });

  // ==========================================
  // Test 6: Branch stock isolation (FINDING-12 Phase 3)
  // ==========================================
  test('Test 6: Stock adjustment in Branch A1 isolates stock from Branch A2', async () => {
    const cat = await Category.create({
      name: `Branch Stock Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    // Create product in Branch A1 with initial stock 10
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Isolated Item',
        price: 150,
        cost: 80,
        stockQuantity: 10,
        categoryId: cat.id
      })
      .expect(201);

    const prodId = prodRes.body.id;

    // Adjust stock in Branch A1 by +15
    await request(app)
      .patch(`/api/products/${prodId}/stock`)
      .set('Authorization', tokenA1)
      .send({ quantity: 15 })
      .expect(200);

    // Verify Branch A1 has 25 units
    const invA1 = await Inventory.findOne({ where: { productId: prodId, shopId: shopA1.id } });
    expect(parseFloat(invA1.stockQuantity)).toBe(25);

    // Verify Branch A2 has 0 units (isolated)
    const invA2 = await Inventory.findOne({ where: { productId: prodId, shopId: shopA2.id } });
    const stockA2 = invA2 ? parseFloat(invA2.stockQuantity) : 0;
    expect(stockA2).toBe(0);
  });

  // ==========================================
  // Test 7: Atomic stock transfer between branches (P1-02)
  // ==========================================
  test('Test 7: Atomic stock transfer debits source and credits destination with paired movements', async () => {
    const cat = await Category.create({
      name: `Transfer Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    // Create product in Branch A1 with stock 40
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Transferable Item',
        price: 300,
        cost: 150,
        stockQuantity: 40,
        categoryId: cat.id
      })
      .expect(201);

    const prodId = prodRes.body.id;

    // Execute transfer: Move 15 units from Shop A1 -> Shop A2
    const transferRes = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA1)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodId,
        quantity: 15,
        notes: 'Replenishing Branch A2 stock'
      })
      .expect(201);

    expect(transferRes.body.status).toBe('COMPLETED');
    expect(transferRes.body.reference).toMatch(/^TRF-/);
    expect(transferRes.body.sourceNewStock).toBe(25);
    expect(transferRes.body.destinationNewStock).toBe(15);

    // Verify DB inventory
    const srcInv = await Inventory.findOne({ where: { productId: prodId, shopId: shopA1.id } });
    const dstInv = await Inventory.findOne({ where: { productId: prodId, shopId: shopA2.id } });
    expect(parseFloat(srcInv.stockQuantity)).toBe(25);
    expect(parseFloat(dstInv.stockQuantity)).toBe(15);

    // Verify paired StockMovement records
    const movements = await StockMovement.findAll({
      where: { reference: transferRes.body.reference }
    });
    expect(movements.length).toBe(2);

    const srcMovement = movements.find(m => m.shopId === shopA1.id);
    const dstMovement = movements.find(m => m.shopId === shopA2.id);

    expect(parseFloat(srcMovement.quantity)).toBe(-15);
    expect(srcMovement.type).toBe('TRANSFER');
    expect(srcMovement.organizationId).toBe(orgA.id);

    expect(parseFloat(dstMovement.quantity)).toBe(15);
    expect(dstMovement.type).toBe('TRANSFER');
    expect(dstMovement.organizationId).toBe(orgA.id);
  });

  // ==========================================
  // Test 8: Cross-tenant stock transfer rejection (P1-02)
  // ==========================================
  test('Test 8: Cross-tenant stock transfer is rejected with 403 Forbidden', async () => {
    const cat = await Category.create({
      name: `Cross Org Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Cross Tenant Item',
        price: 250,
        cost: 120,
        stockQuantity: 30,
        categoryId: cat.id
      })
      .expect(201);

    // Tenant A attempts to transfer stock to Shop B1 (Tenant B)
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA1)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopB1.id,
        productId: prodRes.body.id,
        quantity: 5
      })
      .expect(403);

    expect(res.body.error).toMatch(/does not belong to your organization/i);
  });

  // ==========================================
  // Test 9: Insufficient transfer quantity rejection (P1-02)
  // ==========================================
  test('Test 9: Transfer exceeding available source stock is rejected with 409 Conflict', async () => {
    const cat = await Category.create({
      name: `Overdraft Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Scarce Item',
        price: 500,
        cost: 250,
        stockQuantity: 5,
        categoryId: cat.id
      })
      .expect(201);

    // Attempt to transfer 10 units when only 5 exist
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA1)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodRes.body.id,
        quantity: 10
      })
      .expect(409);

    expect(res.body.error).toMatch(/Insufficient stock/i);
  });

  // ==========================================
  // Test 10: Employee attribution on StockMovements (P2-02)
  // ==========================================
  test('Test 10: Cashier stock adjustment records employeeId and organizationId', async () => {
    const cat = await Category.create({
      name: `Employee Audit Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Audited Item',
        price: 100,
        cost: 50,
        stockQuantity: 20,
        categoryId: cat.id
      })
      .expect(201);

    const prodId = prodRes.body.id;

    // Cashier employee performs stock adjustment (+5)
    await request(app)
      .patch(`/api/products/${prodId}/stock`)
      .set('Authorization', tokenEmpA1)
      .send({ quantity: 5 })
      .expect(200);

    // Check StockMovement
    const movement = await StockMovement.findOne({
      where: { productId: prodId, type: 'ADJUSTMENT' },
      order: [['id', 'DESC']]
    });

    expect(movement).toBeDefined();
    expect(movement.employeeId).toBe(empA1.id);
    expect(movement.userId).toBeNull();
    expect(movement.organizationId).toBe(orgA.id);
    expect(parseFloat(movement.quantity)).toBe(5);
  });

  // ==========================================
  // Test 11: Stock adjustment audit trail (P2-01)
  // ==========================================
  test('Test 11: Stock adjustment records correct previous and new stock in audit trail', async () => {
    const cat = await Category.create({
      name: `Audit History Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Audited Product',
        price: 80,
        cost: 40,
        stockQuantity: 30,
        categoryId: cat.id
      })
      .expect(201);

    const prodId = prodRes.body.id;

    // Reduce stock by 12
    await request(app)
      .patch(`/api/products/${prodId}/stock`)
      .set('Authorization', tokenA1)
      .send({ quantity: -12 })
      .expect(200);

    const movement = await StockMovement.findOne({
      where: { productId: prodId, type: 'ADJUSTMENT' },
      order: [['id', 'DESC']]
    });

    expect(parseFloat(movement.previousStock)).toBe(30);
    expect(parseFloat(movement.quantity)).toBe(-12);
    expect(parseFloat(movement.newStock)).toBe(18);
  });

  // ==========================================
  // Test 12: Direct stockQuantity mutation prevented on product update
  // ==========================================
  test('Test 12: Direct stockQuantity mutation is ignored in PUT /api/products/:id', async () => {
    const cat = await Category.create({
      name: `Catalog Protect Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', tokenA1)
      .send({
        name: 'Protected Product',
        price: 120,
        cost: 60,
        stockQuantity: 15,
        categoryId: cat.id
      })
      .expect(201);

    const prodId = prodRes.body.id;

    // Attempt to directly change stockQuantity via PUT /api/products/:id
    await request(app)
      .put(`/api/products/${prodId}`)
      .set('Authorization', tokenA1)
      .send({
        name: 'Protected Product Renamed',
        price: 130,
        cost: 60,
        stockQuantity: 9999, // Attempted bypass!
        categoryId: cat.id
      })
      .expect(200);

    // Verify stock was NOT modified to 9999
    const inv = await Inventory.findOne({ where: { productId: prodId, shopId: shopA1.id } });
    expect(parseFloat(inv.stockQuantity)).toBe(15);
  });
});
