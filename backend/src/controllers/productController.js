const { logActivity } = require('../middleware/logger');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Product = require('../models/Product');
const Category = require('../models/Category');
const SystemSettings = require('../models/SystemSettings');
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

    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericPageSize = Math.min(Math.max(parseInt(pageSize, 10) || 12, 1), 100);
    const offset = (numericPage - 1) * numericPageSize;

    const isDefaultQuery = !search && !categoryId && !availability && !minPrice && !maxPrice;
    const cacheKey = `products:shop:${req.user.shopId}`;

    if (isDefaultQuery) {
      try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          const cachedResult = JSON.parse(cachedData);
          const totalPages = Math.ceil(cachedResult.count / numericPageSize) || 1;
          const paginatedProducts = cachedResult.rows.slice(offset, offset + numericPageSize);
          logger.debug(`Product catalogue cache HIT for shop: ${req.user.shopId}`);
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
        logger.warn(`Redis error fetching product cache for shop ${req.user.shopId}:`, err);
      }

      logger.debug(`Product catalogue cache MISS for shop: ${req.user.shopId}, querying database`);
      try {
        const allProducts = await Product.findAndCountAll({
          where: { active: true, shopId: req.user.shopId },
          include: [
            { model: Category, attributes: ['id', 'name'], where: { shopId: req.user.shopId } }
          ],
          order: [['createdAt', 'DESC']],
          distinct: true,
        });

        try {
          await redisClient.setex(cacheKey, 600, JSON.stringify({ count: allProducts.count, rows: allProducts.rows }));
        } catch (err) {
          logger.warn(`Redis error caching products for shop ${req.user.shopId}:`, err);
        }

        const totalPages = Math.ceil(allProducts.count / numericPageSize) || 1;
        const paginatedProducts = allProducts.rows.slice(offset, offset + numericPageSize);
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
        // Fall through to regular DB paginated execution in case of unexpected DB error
      }
    }

    const where = {
      active: true,
      shopId: req.user.shopId,
    };

    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: term } },
        { sku: { [Op.like]: term } },
        { barcode: { [Op.like]: term } },
      ];
    }

    if (categoryId) {
      where.CategoryId = parseInt(categoryId, 10);
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = parseFloat(minPrice);
      if (maxPrice) where.price[Op.lte] = parseFloat(maxPrice);
    }

    if (availability === 'in_stock') {
      where.stockQuantity = { [Op.gt]: 0 };
    } else if (availability === 'low_stock') {
      // stockQuantity <= reorderPoint and > 0
      where[Op.and] = [
        { stockQuantity: { [Op.gt]: 0 } },
        { stockQuantity: { [Op.lte]: { [Op.col]: 'reorderPoint' } } },
      ];
    } else if (availability === 'out_of_stock') {
      where.stockQuantity = 0;
    }

    const include = [
      { model: Category, attributes: ['id', 'name'], where: { shopId: req.user.shopId } },
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
          shopId: req.user.shopId,
        };

        if (categoryId) fuzzyWhere.CategoryId = parseInt(categoryId, 10);
        if (minPrice || maxPrice) {
          fuzzyWhere.price = {};
          if (minPrice) fuzzyWhere.price[Op.gte] = parseFloat(minPrice);
          if (maxPrice) fuzzyWhere.price[Op.lte] = parseFloat(maxPrice);
        }
        if (availability === 'in_stock') {
          fuzzyWhere.stockQuantity = { [Op.gt]: 0 };
        } else if (availability === 'low_stock') {
          fuzzyWhere[Op.and] = [
            { stockQuantity: { [Op.gt]: 0 } },
            { stockQuantity: { [Op.lte]: { [Op.col]: 'reorderPoint' } } },
          ];
        } else if (availability === 'out_of_stock') {
          fuzzyWhere.stockQuantity = 0;
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
          shopId: req.user.shopId,
        };

        if (categoryId) fuzzyWhere.CategoryId = parseInt(categoryId, 10);
        if (minPrice || maxPrice) {
          fuzzyWhere.price = {};
          if (minPrice) fuzzyWhere.price[Op.gte] = parseFloat(minPrice);
          if (maxPrice) fuzzyWhere.price[Op.lte] = parseFloat(maxPrice);
        }
        if (availability === 'in_stock') {
          fuzzyWhere.stockQuantity = { [Op.gt]: 0 };
        } else if (availability === 'low_stock') {
          fuzzyWhere[Op.and] = [
            { stockQuantity: { [Op.gt]: 0 } },
            { stockQuantity: { [Op.lte]: { [Op.col]: 'reorderPoint' } } },
          ];
        } else if (availability === 'out_of_stock') {
          fuzzyWhere.stockQuantity = 0;
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

    res.json({
      products: rows,
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
    const product = await Product.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId },
      include: [{ model: Category, attributes: ['id', 'name'], where: { shopId: req.user.shopId } }]
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
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

    const product = await Product.create({
      name,
      sku: finalSku,
      barcode: finalBarcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint: finalReorderPoint,
      CategoryId,
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
      expirationDate,
      weightGrams
    } = req.body;

    await product.update({
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      stockQuantity,
      reorderPoint,
      CategoryId,
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
