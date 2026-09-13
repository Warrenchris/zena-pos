const { logActivity } = require('../middleware/logger');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Product, Category, SystemSettings, Inventory, Shop } = require('../models');

// Helper to format product with branch-scoped inventory
function formatProductWithInventory(product) {
  if (!product) return product;
  const plain = (typeof product.get === 'function')
    ? product.get({ plain: true })
    : { ...product };

  const inventories = plain.Inventories || (plain.Inventory ? [plain.Inventory] : []);
  const branchInv = inventories.length > 0 ? inventories[0] : null;

  plain.stockQuantity = branchInv ? branchInv.stockQuantity : 0;
  plain.reorderPoint = branchInv ? branchInv.reorderPoint : (plain.reorderPoint !== undefined ? plain.reorderPoint : 10);
  return plain;
}
const redisClient = require('../config/redis');
const { invalidateShopProductCache } = require('../services/productCache');
const logger = require('../utils/logger');

// Get all products with filters and pagination
exports.getAllProducts = async (req, res) => {
  try {
    const {
      search,
      categoryId,
      availability, // 'in_stock' | 'low_stock' | 'out_of_stock'
      minPrice,
      maxPrice,
      page = 1,
      pageSize = 12,
      fuzzy
    } = req.query;

    const shopId = req.shopId || req.user?.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericPageSize = Math.min(Math.max(parseInt(pageSize, 10) || 12, 1), 100);
    const offset = (numericPage - 1) * numericPageSize;

    const isDefaultQuery = !search && !categoryId && !availability && !minPrice && !maxPrice;
    const cacheKey = `products:shop:${shopId}`;

    if (isDefaultQuery) {
      try {
        const cachedData = redisClient.status === 'ready' ? await redisClient.get(cacheKey) : null;
        if (cachedData) {
          const cachedResult = JSON.parse(cachedData);
          const totalPages = Math.ceil(cachedResult.count / numericPageSize) || 1;
          const paginatedProducts = cachedResult.rows.slice(offset, offset + numericPageSize);
          logger.debug(`Product catalogue cache HIT for shop: ${shopId}`);
          return res.json({
            products: paginatedProducts,
            searchType: 'exact',
            pagination: {
              currentPage: numericPage,
              totalPages,
              total: cachedResult.count,
            },
          });
        }
      } catch (err) {
        logger.warn(`Redis error fetching product cache for shop ${shopId}:`, err);
      }

      logger.debug(`Product catalogue cache MISS for shop: ${shopId}, querying database`);
      try {
        const catalogWhere = { active: true };
        if (organizationId) {
          catalogWhere.organizationId = organizationId;
        } else {
          catalogWhere.shopId = shopId;
        }

        const allProducts = await Product.findAndCountAll({
          where: catalogWhere,
          include: [
            { model: Category, attributes: ['id', 'name'], required: false },
            {
              model: Inventory,
              attributes: ['stockQuantity', 'reorderPoint', 'shopId'],
              where: { shopId },
              required: false
            }
          ],
          order: [['createdAt', 'DESC']],
          distinct: true,
        });

        const formattedRows = allProducts.rows.map(p => formatProductWithInventory(p));

        try {
          if (redisClient.status === 'ready') {
            await redisClient.setex(cacheKey, 600, JSON.stringify({ count: allProducts.count, rows: formattedRows }));
          }
        } catch (err) {
          logger.warn(`Redis error caching products for shop ${shopId}:`, err);
        }

        const totalPages = Math.ceil(allProducts.count / numericPageSize) || 1;
        const paginatedProducts = formattedRows.slice(offset, offset + numericPageSize);
        return res.json({
          products: paginatedProducts,
          searchType: 'exact',
          pagination: {
            currentPage: numericPage,
            totalPages,
            total: allProducts.count,
          },
        });
      } catch (error) {
        console.error('Error fetching all products on cache miss:', error);
      }
    }

    const where = {
      active: true,
    };
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.shopId = shopId;
    }

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: term } },
        { sku: { [Op.like]: term } },
        { barcode: { [Op.like]: term } },
      ];
    }

    const filterCategoryId = req.query.categoryId || req.query.CategoryId;
    if (filterCategoryId) {
      where.categoryId = parseInt(filterCategoryId, 10);
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
      if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
    }

    const inventoryWhere = { shopId };
    let inventoryRequired = false;

    if (availability === 'in_stock') {
      inventoryWhere.stockQuantity = { [Op.gt]: 0 };
      inventoryRequired = true;
    } else if (availability === 'low_stock') {
      const { Sequelize } = require('sequelize');
      inventoryWhere[Op.and] = [
        { stockQuantity: { [Op.gt]: 0 } },
        Sequelize.where(Sequelize.col('Inventories.stockQuantity'), '<=', Sequelize.col('Inventories.reorderPoint'))
      ];
      inventoryRequired = true;
    } else if (availability === 'out_of_stock') {
      where[Op.or] = [
        { '$Inventories.id$': null },
        { '$Inventories.stockQuantity$': 0 }
      ];
      inventoryRequired = false;
    }

    const include = [
      { model: Category, attributes: ['id', 'name'], required: false },
      {
        model: Inventory,
        attributes: ['id', 'stockQuantity', 'reorderPoint', 'shopId'],
        where: inventoryWhere,
        required: inventoryRequired
      }
    ];

    let { rows, count } = await Product.findAndCountAll({
      where,
      include,
      limit: numericPageSize,
      offset,
      order: [['createdAt', 'DESC']],
      distinct: true,
    });

    let searchType = 'exact';

    if (count === 0 && (fuzzy === 'true' || fuzzy === true) && search && String(search).trim()) {
      const cleanSearch = String(search).trim();
      const dialect = Product.sequelize.options.dialect || '';

      if (dialect.includes('mysql') || dialect.includes('mariadb')) {
        const fuzzyWhere = {
          active: true,
        };
        if (organizationId) {
          fuzzyWhere.organizationId = organizationId;
        } else {
          fuzzyWhere.shopId = shopId;
        }

        if (categoryId) fuzzyWhere.CategoryId = parseInt(categoryId, 10);
        if (minPrice || maxPrice) {
          fuzzyWhere.price = {};
          if (minPrice) fuzzyWhere.price[Op.gte] = parseFloat(minPrice);
          if (maxPrice) fuzzyWhere.price[Op.lte] = parseFloat(maxPrice);
        }

        const { Sequelize } = require('sequelize');
        fuzzyWhere[Op.or] = [
          Sequelize.literal("SOUNDEX(`Product`.`name`) = SOUNDEX(" + Product.sequelize.escape(cleanSearch) + ")"),
          { name: { [Op.like]: `%${cleanSearch}%` } }
        ];

        const fuzzyResult = await Product.findAndCountAll({
          where: fuzzyWhere,
          include,
          limit: numericPageSize,
          offset,
          order: [['createdAt', 'DESC']],
          distinct: true,
        });

        if (fuzzyResult.count > 0) {
          rows = fuzzyResult.rows;
          count = fuzzyResult.count;
          const cleanSearchLower = cleanSearch.toLowerCase();
          const likeMatched = rows.some(row => row.name && row.name.toLowerCase().includes(cleanSearchLower));
          searchType = likeMatched ? 'exact' : 'fuzzy';
        }
      } else if (dialect.includes('postgres')) {
        const fuzzyWhere = {
          active: true,
        };
        if (organizationId) {
          fuzzyWhere.organizationId = organizationId;
        } else {
          fuzzyWhere.shopId = shopId;
        }

        if (categoryId) fuzzyWhere.CategoryId = parseInt(categoryId, 10);
        if (minPrice || maxPrice) {
          fuzzyWhere.price = {};
          if (minPrice) fuzzyWhere.price[Op.gte] = parseFloat(minPrice);
          if (maxPrice) fuzzyWhere.price[Op.lte] = parseFloat(maxPrice);
        }

        const { Sequelize } = require('sequelize');
        fuzzyWhere[Op.or] = [
          Sequelize.literal('similarity("Product"."name", ' + Product.sequelize.escape(cleanSearch) + ') > 0.2'),
          { name: { [Op.iLike]: `%${cleanSearch}%` } }
        ];

        const fuzzyResult = await Product.findAndCountAll({
          where: fuzzyWhere,
          include,
          limit: numericPageSize,
          offset,
          order: [['createdAt', 'DESC']],
          distinct: true,
        });

        if (fuzzyResult.count > 0) {
          rows = fuzzyResult.rows;
          count = fuzzyResult.count;
          searchType = 'fuzzy';
        }
      }
    }

    const totalPages = Math.ceil(count / numericPageSize) || 1;
    const formattedRows = rows.map(p => formatProductWithInventory(p));

    res.json({
      products: formattedRows,
      searchType,
      pagination: {
        currentPage: numericPage,
        totalPages,
        total: count,
      },
    });
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    res.status(500).json({ error: 'Failed to fetch products', details: error.message });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const where = { id: req.params.id, active: true };
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.shopId = shopId;
    }

    const product = await Product.findOne({
      where,
      include: [
        { model: Category, attributes: ['id', 'name'], required: false },
        {
          model: Inventory,
          attributes: ['stockQuantity', 'reorderPoint', 'shopId'],
          where: { shopId },
          required: false
        }
      ]
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(formatProductWithInventory(product));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
};

const { generateSKU, generateBarcode } = require('../utils/skuGenerator');

// Create product
exports.createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      CategoryId,
      categoryId,
      expirationDate,
      weightGrams
    } = req.body;

    const shopId = req.shopId || req.user?.shopId;
    let finalSku = sku ? String(sku).trim() : '';
    let finalBarcode = barcode ? String(barcode).trim() : '';
    let finalReorderPoint = (reorderPoint !== undefined && reorderPoint !== null && reorderPoint !== '')
      ? parseInt(reorderPoint, 10)
      : null;

    if (!finalSku || !finalBarcode || finalReorderPoint === null) {
      const settings = await SystemSettings.findOne({ where: { shopId } });
      const skuPrefix = settings?.skuPrefix || 'SKU';
      const barcodeFormat = settings?.barcodeFormat || 'EAN13';
      const defaultLowStock = settings?.lowStockThreshold !== undefined ? settings.lowStockThreshold : 10;

      if (!finalSku) {
        const count = await Product.count({ where: { shopId } });
        finalSku = generateSKU(skuPrefix, count + 1);
      }
      if (!finalBarcode) {
        finalBarcode = generateBarcode(barcodeFormat);
      }
      if (finalReorderPoint === null) {
        finalReorderPoint = defaultLowStock;
      }
    }

    const targetCategoryId = categoryId || CategoryId;
    const parsedCategoryId = targetCategoryId ? parseInt(targetCategoryId, 10) : null;

    const product = await Product.create({
      name,
      sku: finalSku,
      barcode: finalBarcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint: finalReorderPoint,
      categoryId: parsedCategoryId,
      CategoryId: parsedCategoryId,
      expirationDate: expirationDate || null,
      weightGrams: typeof weightGrams === 'number' ? weightGrams : (weightGrams ? parseInt(weightGrams, 10) : null),
      shopId
    });

    const productWithCategory = await Product.findOne({
      where: { id: product.id },
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });

    await invalidateShopProductCache(req.user.shopId);

    res.status(201).json(productWithCategory);
    try {
      await logActivity({
        shopId: req.shopId || req.user?.shopId,
        performedBy: req.user?.id,
        performedByType: req.user?.isEmployee ? 'employee' : 'user',
        action: 'PRODUCT_CREATED',
        entity: 'Product',
        entityId: product.id,
        details: `SKU: ${sku}`
      });
    } catch (_) {}
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'SKU or barcode already exists' });
    }
    res.status(500).json({ error: 'Failed to create product', details: error.message });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const {
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      CategoryId,
      categoryId,
      expirationDate,
      weightGrams
    } = req.body;

    const targetCategoryId = categoryId || CategoryId;
    const parsedCategoryId = (targetCategoryId !== undefined && targetCategoryId !== null && targetCategoryId !== '')
      ? parseInt(targetCategoryId, 10)
      : (product.categoryId || product.CategoryId);

    await product.update({
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      categoryId: parsedCategoryId,
      CategoryId: parsedCategoryId,
      expirationDate: expirationDate || null,
      weightGrams: typeof weightGrams === 'number' ? weightGrams : (weightGrams ? parseInt(weightGrams, 10) : product.weightGrams)
    });

    await invalidateShopProductCache(req.user.shopId);

    const updatedProduct = await Product.findOne({
      where: { id: product.id },
      include: [{ model: Category, attributes: ['id', 'name'] }]
    });

    res.json(updatedProduct);
    try {
      await logActivity({
        shopId: req.shopId || req.user?.shopId,
        performedBy: req.user?.id,
        performedByType: req.user?.isEmployee ? 'employee' : 'user',
        action: 'PRODUCT_UPDATED',
        entity: 'Product',
        entityId: product.id
      });
    } catch (_) {}
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'SKU or barcode already exists' });
    }
    res.status(500).json({ error: 'Failed to update product' });
  }
};

// Delete product (soft delete)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await product.update({ active: false });
    await invalidateShopProductCache(req.user.shopId);
    res.json({ message: 'Product deleted successfully' });
    try {
      await logActivity({
        shopId: req.shopId || req.user?.shopId,
        performedBy: req.user?.id,
        performedByType: req.user?.isEmployee ? 'employee' : 'user',
        action: 'PRODUCT_DELETED',
        entity: 'Product',
        entityId: product.id
      });
    } catch (_) {}
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

// Update stock quantity
exports.updateStock = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quantity } = req.body;
    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newQuantity = product.stockQuantity + parseInt(quantity);
    if (newQuantity < 0) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    await product.update({ stockQuantity: newQuantity });
    await invalidateShopProductCache(req.user.shopId);
    res.json(product);
    try {
      await logActivity({
        shopId: req.shopId || req.user?.shopId,
        performedBy: req.user?.id,
        performedByType: req.user?.isEmployee ? 'employee' : 'user',
        action: 'STOCK_ADJUSTED',
        entity: 'Product',
        entityId: product.id,
        details: `Delta: ${quantity}`
      });
    } catch (_) {}
  } catch (error) {
    res.status(500).json({ error: 'Failed to update stock' });
  }
};

// Batch fetch products by IDs (for fast cart revalidation)
exports.getProductsBatch = async (req, res) => {
  try {
    const shopId = req.user?.shopId || req.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }
    const { ids } = req.query;
    
    let idArray = [];
    if (typeof ids === 'string') {
      idArray = ids.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id) && id > 0);
    } else if (Array.isArray(ids)) {
      idArray = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0);
    }

    if (idArray.length === 0) {
      return res.json([]);
    }

    if (idArray.length > 100) {
      return res.status(400).json({ error: 'Batch query limited to 100 products max' });
    }

    const where = {
      id: { [Op.in]: idArray },
      active: true
    };
    if (organizationId) {
      where.organizationId = organizationId;
    } else {
      where.shopId = shopId;
    }

    const products = await Product.findAll({
      where,
      attributes: ['id', 'name', 'sku', 'price', 'stockQuantity', 'active'],
      include: [
        {
          model: Inventory,
          attributes: ['stockQuantity', 'reorderPoint', 'shopId'],
          where: { shopId },
          required: false
        }
      ]
    });

    res.json(products.map(p => formatProductWithInventory(p)));
  } catch (error) {
    logger.error('Error in getProductsBatch:', error);
    res.status(500).json({ error: 'Failed to batch fetch products' });
  }
};
