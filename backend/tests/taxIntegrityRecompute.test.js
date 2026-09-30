'use strict';

const sequelize = require('../src/config/database');
const { Product, Category, SystemSettings, Shop, Organization, User, Sale, SaleItem, Inventory, SaleRefund, SalePayment, StockMovement } = require('../src/models');
const saleController = require('../src/controllers/saleController');
const tokenRevocationService = require('../src/services/tokenRevocationService');

describe('Tax Integrity Recompute Matrix (Commit 2)', () => {
  const TEST_ORG_ID = 82;
  const TEST_SHOP_ID = 802;
  const TEST_USER_ID = 8201;

  let testUser;
  let stdCategory;
  let exemptCategory;
  let zeroCategory;
  let standardProduct;
  let zeroProduct;
  let exemptProduct;
  let fallbackProduct;
  let overrideProduct;

  const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  beforeAll(async () => {
    await sequelize.authenticate();

    await Organization.findOrCreate({
      where: { id: TEST_ORG_ID },
      defaults: {
        id: TEST_ORG_ID,
        name: 'Tax Matrix Org',
        slug: `tax-matrix-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      }
    });

    await Shop.findOrCreate({
      where: { id: TEST_SHOP_ID },
      defaults: {
        id: TEST_SHOP_ID,
        name: 'Tax Matrix Shop',
        organizationId: TEST_ORG_ID,
        active: true
      }
    });

    [testUser] = await User.findOrCreate({
      where: { id: TEST_USER_ID },
      defaults: {
        id: TEST_USER_ID,
        name: 'Tax Cashier',
        email: `tax-cashier-${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: TEST_SHOP_ID,
        active: true
      }
    });

    await tokenRevocationService.clearUserStatus(TEST_USER_ID, false);
    await tokenRevocationService.setUserStatus(TEST_USER_ID, false, 'active');
    await tokenRevocationService.clearUserTokenCutoff(TEST_USER_ID, false);

    // Ensure shop settings: 16% tax, taxInclusive = false (exclusive by default)
    await SystemSettings.destroy({ where: { shopId: TEST_SHOP_ID } });
    await SystemSettings.create({
      shopId: TEST_SHOP_ID,
      taxRate: 16.00,
      taxInclusive: false
    });

    // Categories
    stdCategory = await Category.create({
      name: `Standard Category ${Date.now()}`,
      taxCategory: 'standard',
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    exemptCategory = await Category.create({
      name: `Exempt Category ${Date.now()}`,
      taxCategory: 'exempt',
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    zeroCategory = await Category.create({
      name: `Zero Category ${Date.now()}`,
      taxCategory: 'zero_rated',
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    // Products
    standardProduct = await Product.create({
      name: 'Standard Product',
      sku: `STD-SKU-${Date.now()}`,
      price: 1000.00,
      cost: 600.00,
      categoryId: stdCategory.id,
      taxCategory: 'standard',
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    zeroProduct = await Product.create({
      name: 'Zero Rated Product',
      sku: `ZERO-SKU-${Date.now()}`,
      price: 500.00,
      cost: 300.00,
      categoryId: zeroCategory.id,
      taxCategory: 'zero_rated',
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    exemptProduct = await Product.create({
      name: 'Exempt Product',
      sku: `EXEMPT-SKU-${Date.now()}`,
      price: 300.00,
      cost: 180.00,
      categoryId: exemptCategory.id,
      taxCategory: 'exempt',
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    // Product with null taxCategory in exempt category (tests category fallback)
    fallbackProduct = await Product.create({
      name: 'Fallback Exempt Product',
      sku: `FALLBACK-SKU-${Date.now()}`,
      price: 400.00,
      cost: 200.00,
      categoryId: exemptCategory.id,
      taxCategory: null,
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    // Product with explicit 'standard' in exempt category (tests product override)
    overrideProduct = await Product.create({
      name: 'Override Standard Product',
      sku: `OVERRIDE-SKU-${Date.now()}`,
      price: 800.00,
      cost: 400.00,
      categoryId: exemptCategory.id,
      taxCategory: 'standard',
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    // Seed inventory for all products
    for (const p of [standardProduct, zeroProduct, exemptProduct, fallbackProduct, overrideProduct]) {
      await Inventory.findOrCreate({
        where: { productId: p.id, shopId: TEST_SHOP_ID },
        defaults: { productId: p.id, shopId: TEST_SHOP_ID, stockQuantity: 1000, reorderPoint: 10 }
      });
    }
  });

  afterAll(async () => {
    await SaleRefund.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
    await SalePayment.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
    await SaleItem.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
    await StockMovement.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
    await Sale.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
    await Inventory.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
    await Product.destroy({ where: { organizationId: TEST_ORG_ID } }).catch(() => {});
    await Category.destroy({ where: { organizationId: TEST_ORG_ID } }).catch(() => {});
    await SystemSettings.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
  });

  // Scenario 1: Standard item (Exclusive: 1000 + 16% = 1160)
  test('Scenario 1: Standard exclusive sale computes 16% tax and persists SaleItem tax fields', async () => {
    const sale = await saleController.createSaleInternal({
      items: [{ productId: standardProduct.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentAmount: 1160.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.subtotal)).toBe(1000.00);
    expect(parseFloat(sale.tax)).toBe(160.00);
    expect(parseFloat(sale.total)).toBe(1160.00);

    const items = await SaleItem.findAll({ where: { saleId: sale.id } });
    expect(items.length).toBe(1);
    expect(parseFloat(items[0].taxRate)).toBe(16.00);
    expect(parseFloat(items[0].taxAmount)).toBe(160.00);
  });

  // Scenario 2: Zero-rated item (Exclusive: 500 + 0% = 500)
  test('Scenario 2: Zero-rated item computes 0 tax', async () => {
    const sale = await saleController.createSaleInternal({
      items: [{ productId: zeroProduct.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentAmount: 500.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.tax)).toBe(0.00);
    expect(parseFloat(sale.total)).toBe(500.00);

    const items = await SaleItem.findAll({ where: { saleId: sale.id } });
    expect(parseFloat(items[0].taxRate)).toBe(0.00);
    expect(parseFloat(items[0].taxAmount)).toBe(0.00);
  });

  // Scenario 3: Exempt item (Exclusive: 300 + 0% = 300)
  test('Scenario 3: Exempt item computes 0 tax', async () => {
    const sale = await saleController.createSaleInternal({
      items: [{ productId: exemptProduct.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentAmount: 300.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.tax)).toBe(0.00);
    expect(parseFloat(sale.total)).toBe(300.00);

    const items = await SaleItem.findAll({ where: { saleId: sale.id } });
    expect(parseFloat(items[0].taxRate)).toBe(0.00);
    expect(parseFloat(items[0].taxAmount)).toBe(0.00);
  });

  // Scenario 4: Mixed Cart (1 Standard 1000 + 1 Zero 500 + 1 Exempt 300 -> Tax 160 -> Total 1960)
  test('Scenario 4: Mixed cart computes tax only on standard item', async () => {
    const sale = await saleController.createSaleInternal({
      items: [
        { productId: standardProduct.id, quantity: 1 },
        { productId: zeroProduct.id, quantity: 1 },
        { productId: exemptProduct.id, quantity: 1 }
      ],
      paymentMethod: 'cash',
      paymentAmount: 1960.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.subtotal)).toBe(1800.00);
    expect(parseFloat(sale.tax)).toBe(160.00);
    expect(parseFloat(sale.total)).toBe(1960.00);

    const items = await SaleItem.findAll({ where: { saleId: sale.id }, order: [['productId', 'ASC']] });
    const stdItem = items.find(i => i.productId === standardProduct.id);
    const zeroItem = items.find(i => i.productId === zeroProduct.id);
    const exemptItem = items.find(i => i.productId === exemptProduct.id);

    expect(parseFloat(stdItem.taxRate)).toBe(16.00);
    expect(parseFloat(stdItem.taxAmount)).toBe(160.00);
    expect(parseFloat(zeroItem.taxAmount)).toBe(0.00);
    expect(parseFloat(exemptItem.taxAmount)).toBe(0.00);
  });

  // Scenario 5: Line-item discount (1000 - 50 discount = 950 net -> 950 * 16% = 152 -> Total 1102)
  test('Scenario 5: Line-item discount reduces taxable base before tax calculation', async () => {
    const sale = await saleController.createSaleInternal({
      items: [
        { productId: standardProduct.id, quantity: 1, discount: 50.00, discountType: 'fixed', discountValue: 50.00 }
      ],
      paymentMethod: 'cash',
      paymentAmount: 1102.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.discount)).toBe(50.00);
    expect(parseFloat(sale.tax)).toBe(152.00);
    expect(parseFloat(sale.total)).toBe(1102.00);

    const [item] = await SaleItem.findAll({ where: { saleId: sale.id } });
    expect(parseFloat(item.taxAmount)).toBe(152.00);
  });

  // Scenario 6: Cart-level discount allocated proportionally (Std 1000 + Exempt 900, Cart Disc 190 -> Std Net 900 -> Tax 144 -> Total 1854)
  test('Scenario 6: Cart-level discount is allocated proportionally to compute taxable base', async () => {
    const sale = await saleController.createSaleInternal({
      items: [
        { productId: standardProduct.id, quantity: 1 },
        { productId: exemptProduct.id, quantity: 3 } // 3 * 300 = 900
      ],
      discount: 190.00, // Proportional allocation across 1000 + 900 = 1900. Std share: 1000/1900 * 190 = 100. Std taxable = 900.
      managerApprovalId: TEST_USER_ID,
      managerPassword: 'Password123!',
      paymentMethod: 'cash',
      paymentAmount: 1854.00 // (1900 - 190) + (900 * 0.16 = 144) = 1710 + 144 = 1854
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.tax)).toBe(144.00);
    expect(parseFloat(sale.total)).toBe(1854.00);
  });

  // Scenario 7a: Rounding tolerance (+/- 0.02) accepts small variance
  test('Scenario 7a: Client total within +/- 0.02 of server total is accepted', async () => {
    // Server total is 1160.00. Client sends 1160.02.
    const saleHigh = await saleController.createSaleInternal({
      items: [{ productId: standardProduct.id, quantity: 1 }],
      total: 1160.02,
      paymentMethod: 'cash',
      paymentAmount: 1160.02
    }, TEST_SHOP_ID, testUser);
    expect(parseFloat(saleHigh.total)).toBe(1160.00);

    // Client sends 1159.98 (-0.02)
    const saleLow = await saleController.createSaleInternal({
      items: [{ productId: standardProduct.id, quantity: 1 }],
      total: 1159.98,
      paymentMethod: 'cash',
      paymentAmount: 1160.00
    }, TEST_SHOP_ID, testUser);
    expect(parseFloat(saleLow.total)).toBe(1160.00);
  });

  // Scenario 7b: Rounding tolerance rejects variance > 0.02
  test('Scenario 7b: Client total differing by > 0.02 is rejected with 400', async () => {
    // Server total is 1160.00. Client sends 1160.03 (+0.03).
    await expect(saleController.createSaleInternal({
      items: [{ productId: standardProduct.id, quantity: 1 }],
      total: 1160.03,
      paymentMethod: 'cash'
    }, TEST_SHOP_ID, testUser)).rejects.toThrow(/Price mismatch/i);

    // Client sends 1000.00 (tampering omitting tax)
    await expect(saleController.createSaleInternal({
      items: [{ productId: standardProduct.id, quantity: 1 }],
      total: 1000.00,
      paymentMethod: 'cash'
    }, TEST_SHOP_ID, testUser)).rejects.toThrow(/Price mismatch/i);
  });

  // Scenario 7c: Client tax tampering differing by > 0.02 is rejected with 400
  test('Scenario 7c: Client sending tampered tax differing by > 0.02 is rejected', async () => {
    await expect(saleController.createSaleInternal({
      items: [{ productId: standardProduct.id, quantity: 1 }],
      tax: 0.00, // Server tax is 160.00
      total: 1160.00,
      paymentMethod: 'cash'
    }, TEST_SHOP_ID, testUser)).rejects.toThrow(/Tax mismatch/i);
  });

  // Scenario 8: Category fallback (Product taxCategory null -> Category 'exempt' -> 0% tax)
  test('Scenario 8: Category fallback resolves taxCategory from Category when Product is null', async () => {
    const sale = await saleController.createSaleInternal({
      items: [{ productId: fallbackProduct.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentAmount: 400.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.tax)).toBe(0.00);
    expect(parseFloat(sale.total)).toBe(400.00);

    const [item] = await SaleItem.findAll({ where: { saleId: sale.id } });
    expect(parseFloat(item.taxRate)).toBe(0.00);
    expect(parseFloat(item.taxAmount)).toBe(0.00);
  });

  // Scenario 9: Product override (Product 'standard' overrides Category 'exempt')
  test('Scenario 9: Explicit Product taxCategory overrides Category taxCategory', async () => {
    const sale = await saleController.createSaleInternal({
      items: [{ productId: overrideProduct.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentAmount: 928.00 // 800 + 16% (128) = 928.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.tax)).toBe(128.00);
    expect(parseFloat(sale.total)).toBe(928.00);

    const [item] = await SaleItem.findAll({ where: { saleId: sale.id } });
    expect(parseFloat(item.taxRate)).toBe(16.00);
    expect(parseFloat(item.taxAmount)).toBe(128.00);
  });

  // Scenario 10: Default fallback (Both Product and Category null -> 'standard' 16%)
  test('Scenario 10: Default fallback evaluates to standard 16% when both Product and Category are null', async () => {
    const defaultCat = await Category.create({
      name: `Null Cat ${Date.now()}`,
      taxCategory: null,
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    const defaultProd = await Product.create({
      name: 'Default Prod',
      sku: `DEF-${Date.now()}`,
      price: 500.00,
      cost: 250.00,
      categoryId: defaultCat.id,
      taxCategory: null,
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID
    });

    await Inventory.create({
      productId: defaultProd.id,
      shopId: TEST_SHOP_ID,
      stockQuantity: 100,
      reorderPoint: 10
    });

    const sale = await saleController.createSaleInternal({
      items: [{ productId: defaultProd.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentAmount: 580.00 // 500 + 16% (80) = 580.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.tax)).toBe(80.00);
    expect(parseFloat(sale.total)).toBe(580.00);
  });

  // Inclusive vs Exclusive Mode Tests
  test('Inclusive Mode: SystemSettings.taxInclusive = true extracts tax from shelf price', async () => {
    try {
      await SystemSettings.update({ taxInclusive: true }, { where: { shopId: TEST_SHOP_ID } });

      const inclusiveProduct = await Product.create({
        name: 'Inclusive Retail Product',
        sku: `INC-${Date.now()}`,
        price: 1160.00,
        cost: 700.00,
        categoryId: stdCategory.id,
        taxCategory: 'standard',
        shopId: TEST_SHOP_ID,
        organizationId: TEST_ORG_ID
      });

      await Inventory.create({
        productId: inclusiveProduct.id,
        shopId: TEST_SHOP_ID,
        stockQuantity: 100,
        reorderPoint: 10
      });

      const sale = await saleController.createSaleInternal({
        items: [{ productId: inclusiveProduct.id, quantity: 1 }],
        paymentMethod: 'cash',
        paymentAmount: 1160.00
      }, TEST_SHOP_ID, testUser);

      expect(parseFloat(sale.tax)).toBe(160.00);
      expect(parseFloat(sale.subtotal)).toBe(1000.00);
      expect(parseFloat(sale.total)).toBe(1160.00);

      const [item] = await SaleItem.findAll({ where: { saleId: sale.id } });
      expect(parseFloat(item.taxRate)).toBe(16.00);
      expect(parseFloat(item.taxAmount)).toBe(160.00);
    } finally {
      // Always reset back to exclusive
      await SystemSettings.update({ taxInclusive: false }, { where: { shopId: TEST_SHOP_ID } });
    }
  });

  test('Exclusive Mode: SystemSettings.taxInclusive = false adds tax on top of shelf price', async () => {
    // Product price is 1000.00. Tax is 160.00. Total = 1160.00.
    const sale = await saleController.createSaleInternal({
      items: [{ productId: standardProduct.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentAmount: 1160.00
    }, TEST_SHOP_ID, testUser);

    expect(parseFloat(sale.tax)).toBe(160.00);
    expect(parseFloat(sale.subtotal)).toBe(1000.00);
    expect(parseFloat(sale.total)).toBe(1160.00);
  });
});
