'use strict';

const sequelize = require('../src/config/database');
const { Product, Category, SystemSettings, Shop, Organization } = require('../src/models');

describe('Tax Integrity Schema & Model Tests (Commit 1)', () => {
  let org;
  let shop;

  beforeAll(async () => {
    await sequelize.authenticate();

    [org] = await Organization.findOrCreate({
      where: { id: 81 },
      defaults: {
        id: 81,
        name: 'Tax Integrity Org',
        slug: `tax-integrity-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      }
    });

    [shop] = await Shop.findOrCreate({
      where: { id: 801 },
      defaults: {
        id: 801,
        name: 'Tax Integrity Shop',
        organizationId: 81,
        active: true
      }
    });
  });

  afterAll(async () => {
    await Product.destroy({ where: { organizationId: 81 } });
    await Category.destroy({ where: { organizationId: 81 } });
    await SystemSettings.destroy({ where: { shopId: 801 } });
  });

  test('Categories table has taxCategory column and accepts enum values or null', async () => {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM `Categories` LIKE 'taxCategory'");
    expect(cols.length).toBe(1);
    expect(cols[0].Null).toBe('YES');

    // Create category with exempt taxCategory
    const exemptCat = await Category.create({
      name: `Exempt Cat ${Date.now()}`,
      taxCategory: 'exempt',
      shopId: 801,
      organizationId: 81
    });
    expect(exemptCat.taxCategory).toBe('exempt');

    // Create category with null taxCategory (default)
    const defaultCat = await Category.create({
      name: `Default Cat ${Date.now()}`,
      shopId: 801,
      organizationId: 81
    });
    expect(defaultCat.taxCategory).toBeNull();
  });

  test('Products table has taxCategory column and accepts enum values or null', async () => {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM `Products` LIKE 'taxCategory'");
    expect(cols.length).toBe(1);
    expect(cols[0].Null).toBe('YES');

    const cat = await Category.create({
      name: `Prod Cat ${Date.now()}`,
      shopId: 801,
      organizationId: 81
    });

    // Create product with zero_rated taxCategory
    const zeroProduct = await Product.create({
      name: 'Zero Rated Product',
      sku: `ZERO-${Date.now()}`,
      price: 250.00,
      cost: 150.00,
      categoryId: cat.id,
      taxCategory: 'zero_rated',
      shopId: 801,
      organizationId: 81
    });
    expect(zeroProduct.taxCategory).toBe('zero_rated');

    // Create product with null taxCategory
    const nullProduct = await Product.create({
      name: 'Standard Product (Null Tax Cat)',
      sku: `STD-${Date.now()}`,
      price: 500.00,
      cost: 300.00,
      categoryId: cat.id,
      shopId: 801,
      organizationId: 81
    });
    expect(nullProduct.taxCategory).toBeNull();
  });

  test('SystemSettings table has taxInclusive column defaulting to false (exclusive)', async () => {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM `SystemSettings` LIKE 'taxInclusive'");
    expect(cols.length).toBe(1);

    const settings = await SystemSettings.create({
      shopId: 801,
      taxRate: 16.00
    });
    expect(settings.taxInclusive).toBe(false);

    await settings.update({ taxInclusive: true });
    await settings.reload();
    expect(settings.taxInclusive).toBe(true);
  });
});
