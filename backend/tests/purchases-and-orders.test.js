const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop,
  Product,
  Purchase,
  PurchaseItem,
  PurchaseOrder,
  PurchaseOrderItem,
  StockMovement,
  Expense,
  ActivityLog,
  Supplier,
  User
} = require('../src/models');

function tokenFor(user) {
  const jwt = require('jsonwebtoken');
  const fs = require('fs');
  const path = require('path');

  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  return 'Bearer ' + jwt.sign(
    user,
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Purchases & Purchase Orders Production Remediation Tests', () => {
  let shop1, shop2;
  let prodShop1, prodShop2;
  const adminTokenShop1 = tokenFor({ id: 101, role: 'admin', shopId: 1 });
  const adminTokenShop2 = tokenFor({ id: 102, role: 'admin', shopId: 2 });
  const cashierTokenShop1 = tokenFor({ id: 103, role: 'cashier', shopId: 1 });
  const noShopToken = tokenFor({ id: 999, role: 'admin' }); // Missing shopId

  beforeAll(async () => {
    await sequelize.authenticate();

    // Ensure Shop 1 and Shop 2 exist
    [shop1] = await Shop.findOrCreate({
      where: { id: 1 },
      defaults: { name: 'Main POS Test Shop', active: true }
    });

    [shop2] = await Shop.findOrCreate({
      where: { id: 2 },
      defaults: { name: 'Second POS Test Shop', active: true }
    });

    // Ensure test users exist for foreign key relations
    await User.findOrCreate({
      where: { id: 101 },
      defaults: {
        name: 'Admin User 1',
        email: 'admin1@test.com',
        password: 'Password123!',
        role: 'admin',
        shopId: 1
      }
    });

    await User.findOrCreate({
      where: { id: 102 },
      defaults: {
        name: 'Admin User 2',
        email: 'admin2@test.com',
        password: 'Password123!',
        role: 'admin',
        shopId: 2
      }
    });

    await User.findOrCreate({
      where: { id: 103 },
      defaults: {
        name: 'Cashier User 1',
        email: 'cashier1@test.com',
        password: 'Password123!',
        role: 'cashier',
        shopId: 1
      }
    });

    // Create test products
    [prodShop1] = await Product.findOrCreate({
      where: { sku: 'TEST-PROD-SHOP1' },
      defaults: {
        name: 'Test Milk 500ml',
        price: 60.00,
        cost: 40.00,
        stockQuantity: 100,
        reorderPoint: 10,
        active: true,
        shopId: 1,
        organizationId: 1
      }
    });
    prodShop1.stockQuantity = 100;
    prodShop1.cost = 40.00;
    await prodShop1.save();

    [prodShop2] = await Product.findOrCreate({
      where: { sku: 'TEST-PROD-SHOP2' },
      defaults: {
        name: 'Test Bread 400g',
        price: 70.00,
        cost: 50.00,
        stockQuantity: 50,
        reorderPoint: 5,
        active: true,
        shopId: 2,
        organizationId: 2
      }
    });
  });

  // -------------------------------------------------------------
  // TEST GROUP 1: TENANT ISOLATION & SHOP CONTEXT
  // -------------------------------------------------------------
  test('TEST 1.1 — Cross-shop purchase access is denied (Shop 2 cannot read Shop 1 purchase)', async () => {
    // Create purchase in Shop 1
    const createRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Shop 1 Vendor',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        items: [{ productId: prodShop1.id, quantity: 10, unitCost: 40.00 }]
      });

    expect(createRes.status).toBe(201);
    const purchaseId = createRes.body.id;

    // Attempt to read with Shop 2 token -> expect 404 Not Found (tenant scoped)
    const readRes = await request(app)
      .get(`/api/purchases/${purchaseId}`)
      .set('Authorization', adminTokenShop2);

    expect(readRes.status).toBe(404);
  });

  test('TEST 1.2 — Token without shop context is rejected with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/purchases')
      .set('Authorization', noShopToken);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Shop context required/i);
  });

  // -------------------------------------------------------------
  // TEST GROUP 2: ROLE-BASED ACCESS CONTROL (RBAC)
  // -------------------------------------------------------------
  test('TEST 2.1 — Cashier cannot create or delete purchases (Expect 403 Access Denied)', async () => {
    const postRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', cashierTokenShop1)
      .send({
        supplierName: 'Unauthorized Vendor',
        items: [{ productId: prodShop1.id, quantity: 5, unitCost: 40 }]
      });

    expect(postRes.status).toBe(403);

    const delRes = await request(app)
      .delete('/api/purchases/1')
      .set('Authorization', cashierTokenShop1);

    expect(delRes.status).toBe(403);
  });

  // -------------------------------------------------------------
  // TEST GROUP 3: INVENTORY RECEIVING & WEIGHTED AVERAGE COST
  // -------------------------------------------------------------
  test('TEST 3.1 — Recording purchase with status RECEIVED increments stock, logs StockMovement, and recalculates cost', async () => {
    const initialStock = prodShop1.stockQuantity; // 100
    const initialCost = parseFloat(prodShop1.cost); // 40.00
    const newQty = 50;
    const newUnitCost = 50.00;

    const res = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Nairobi Dairy Wholesalers',
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        items: [{ productId: prodShop1.id, quantity: newQty, unitCost: newUnitCost }]
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('RECEIVED');
    expect(Number(res.body.totalAmount)).toBe(2500.00);

    // Verify stock incremented
    await prodShop1.reload();
    expect(prodShop1.stockQuantity).toBe(initialStock + newQty); // 150

    // Verify weighted average cost: (100 * 40 + 50 * 50) / 150 = 6500 / 150 = 43.33
    const expectedAvgCost = Math.round((((initialStock * initialCost) + (newQty * newUnitCost)) / (initialStock + newQty)) * 100) / 100;
    expect(Number(prodShop1.cost)).toBe(expectedAvgCost);

    // Verify StockMovement entry
    const movement = await StockMovement.findOne({
      where: { reference: res.body.referenceNo, shopId: 1 },
      order: [['createdAt', 'DESC']]
    });
    expect(movement).not.toBeNull();
    expect(movement.type).toBe('PURCHASE_RECEIPT');
    expect(Number(movement.quantity)).toBe(newQty);
  });

  // -------------------------------------------------------------
  // TEST GROUP 4: PURCHASE CANCELLATION & STOCK REVERSAL
  // -------------------------------------------------------------
  test('TEST 4.1 — Cancelling a received purchase atomically reverses inventory stock and logs reversal', async () => {
    // 1. Create a received purchase
    const createRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Reversal Vendor Ltd',
        status: 'RECEIVED',
        paymentStatus: 'PAID',
        items: [{ productId: prodShop1.id, quantity: 20, unitCost: 40.00 }]
      });

    expect(createRes.status).toBe(201);
    const purchaseId = createRes.body.id;
    const refNo = createRes.body.referenceNo;

    await prodShop1.reload();
    const stockAfterReceipt = prodShop1.stockQuantity;

    // 2. Cancel the purchase
    const cancelRes = await request(app)
      .patch(`/api/purchases/${purchaseId}/cancel`)
      .set('Authorization', adminTokenShop1);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.purchase.status).toBe('CANCELLED');

    // 3. Verify stock reversed
    await prodShop1.reload();
    expect(prodShop1.stockQuantity).toBe(stockAfterReceipt - 20);

    // 4. Verify reversal StockMovement entry
    const revMovement = await StockMovement.findOne({
      where: { reference: refNo, type: 'PURCHASE_REVERSAL', shopId: 1 }
    });
    expect(revMovement).not.toBeNull();
    expect(Number(revMovement.quantity)).toBe(-20);
  });

  // -------------------------------------------------------------
  // TEST GROUP 5: RECEIVING PENDING PURCHASES
  // -------------------------------------------------------------
  test('TEST 5.1 — Pending purchase can be received via PATCH /:id/receive', async () => {
    const createRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Pending Goods Supplier',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        items: [{ productId: prodShop1.id, quantity: 15, unitCost: 40.00 }]
      });

    expect(createRes.status).toBe(201);
    const purchaseId = createRes.body.id;

    await prodShop1.reload();
    const stockBefore = prodShop1.stockQuantity;

    // Receive pending goods
    const recRes = await request(app)
      .patch(`/api/purchases/${purchaseId}/receive`)
      .set('Authorization', adminTokenShop1);

    expect(recRes.status).toBe(200);
    expect(recRes.body.status).toBe('RECEIVED');

    await prodShop1.reload();
    expect(prodShop1.stockQuantity).toBe(stockBefore + 15);
  });

  // -------------------------------------------------------------
  // TEST GROUP 6: FINANCIAL INTEGRATION (EXPENSES & PAYMENTS)
  // -------------------------------------------------------------
  test('TEST 6.1 — Paid purchase creates Expense in financial ledger; partial payment updates outstanding', async () => {
    // 1. Create partial purchase
    const createRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Financial Test Wholesaler',
        status: 'PENDING',
        paymentStatus: 'PARTIAL',
        paidAmount: 200.00,
        paymentMethod: 'M-PESA',
        items: [{ productId: prodShop1.id, quantity: 10, unitCost: 50.00 }] // Total = 500.00
      });

    expect(createRes.status).toBe(201);
    const pId = createRes.body.id;
    const ref = createRes.body.referenceNo;
    expect(Number(createRes.body.totalAmount)).toBe(500.00);
    expect(Number(createRes.body.paidAmount)).toBe(200.00);

    // Verify Expense created for initial 200.00
    const exp1 = await Expense.findOne({ where: { reference: ref, shopId: 1 } });
    expect(exp1).not.toBeNull();
    expect(exp1.category).toBe('inventory');
    expect(Number(exp1.amount)).toBe(200.00);

    // 2. Pay remaining 300.00
    const payRes = await request(app)
      .post(`/api/purchases/${pId}/payments`)
      .set('Authorization', adminTokenShop1)
      .send({ amount: 300.00, paymentMethod: 'CASH' });

    expect(payRes.status).toBe(200);
    expect(payRes.body.paymentStatus).toBe('PAID');
    expect(Number(payRes.body.paidAmount)).toBe(500.00);

    // 3. Overpayment should be rejected
    const overpayRes = await request(app)
      .post(`/api/purchases/${pId}/payments`)
      .set('Authorization', adminTokenShop1)
      .send({ amount: 50.00, paymentMethod: 'CASH' });

    expect(overpayRes.status).toBe(400);
  });

  // -------------------------------------------------------------
  // TEST GROUP 7: PURCHASE ORDERS — LIFECYCLE & PARTIAL RECEIVING
  // -------------------------------------------------------------
  test('TEST 7.1 — PO Partial Receiving (Receive 40 of 100, then 60) updates stock correctly and prevents over-receiving', async () => {
    await prodShop1.reload();
    const stockStart = prodShop1.stockQuantity;

    // 1. Create PO for 100 units
    const poRes = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Bulk Dairy Farm Co',
        items: [{ productId: prodShop1.id, quantityOrdered: 100, unitCost: 40.00 }]
      });

    expect(poRes.status).toBe(201);
    const poId = poRes.body.id;
    expect(poRes.body.status).toBe('ORDERED');

    // 2. Receive 40 units
    const rec40Res = await request(app)
      .patch(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', adminTokenShop1)
      .send({
        receivedItems: [{ productId: prodShop1.id, quantityToReceive: 40 }]
      });

    expect(rec40Res.status).toBe(200);
    expect(rec40Res.body.status).toBe('PARTIALLY_RECEIVED');

    await prodShop1.reload();
    expect(prodShop1.stockQuantity).toBe(stockStart + 40);

    // 3. Attempt to over-receive 70 units (Remaining is only 60) -> Expect HTTP 400
    const overRecRes = await request(app)
      .patch(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', adminTokenShop1)
      .send({
        receivedItems: [{ productId: prodShop1.id, quantityToReceive: 70 }]
      });

    expect(overRecRes.status).toBe(400);
    expect(overRecRes.body.error).toMatch(/Maximum remaining/i);

    // 4. Receive remaining 60 units -> Status should become RECEIVED
    const rec60Res = await request(app)
      .patch(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', adminTokenShop1)
      .send({
        receivedItems: [{ productId: prodShop1.id, quantityToReceive: 60 }]
      });

    expect(rec60Res.status).toBe(200);
    expect(rec60Res.body.status).toBe('RECEIVED');

    await prodShop1.reload();
    expect(prodShop1.stockQuantity).toBe(stockStart + 100);

    // 5. Attempt to receive again on fully RECEIVED PO -> Expect HTTP 400
    const extraRecRes = await request(app)
      .patch(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', adminTokenShop1)
      .send({
        receivedItems: [{ productId: prodShop1.id, quantityToReceive: 10 }]
      });

    expect(extraRecRes.status).toBe(400);
    expect(extraRecRes.body.error).toMatch(/already been fully received/i);
  });

  // -------------------------------------------------------------
  // TEST GROUP 8: VALIDATION & ERROR HANDLING
  // -------------------------------------------------------------
  test('TEST 8.1 — Invalid quantities and non-existent products are strictly rejected', async () => {
    // Negative quantity
    const negQtyRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Validation Supplier',
        items: [{ productId: prodShop1.id, quantity: -5, unitCost: 10 }]
      });
    expect(negQtyRes.status).toBe(400);

    // Missing supplier name
    const noSuppRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: '   ',
        items: [{ productId: prodShop1.id, quantity: 5, unitCost: 10 }]
      });
    expect(noSuppRes.status).toBe(400);

    // Unknown product ID
    const unknownProdRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', adminTokenShop1)
      .send({
        supplierName: 'Validation Supplier',
        items: [{ productId: 999999, quantity: 5, unitCost: 10 }]
      });
    expect(unknownProdRes.status).toBe(404);
  });
});
