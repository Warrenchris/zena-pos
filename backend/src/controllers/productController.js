const { logActivity } = require('../middleware/logger');
const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Product, Category, SystemSettings, Inventory, Shop, StockMovement, User } = require('../models');
const sequelize = require('../config/database');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

// Helper to format product with branch-scoped inventory
function formatProductWithInventory(product) {
  if (!product) return product;
  const plain = (typeof product.get === 'function')
    ? product.get({ plain: true })
    : { ...product };

  const inventories = plain.Inventories || (plain.Inventory ? [plain.Inventory] : []);
  const branchInv = inventories.length > 0 ? inventories[0] : null;

  plain.stockQuantity = branchInv ? branchInv.stockQuantity : (plain.stockQuantity !== undefined ? plain.stockQuantity : 0);
  plain.reorderPoint = branchInv ? branchInv.reorderPoint : (plain.reorderPoint !== undefined ? plain.reorderPoint : 10);
  return plain;
}
const redisClient = require('../config/redis');
const { invalidateShopProductCache, invalidateOrgProductCaches } = require('../services/productCache');
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
    const pageCacheKey = `products:shop:${shopId}:p:${numericPage}:s:${numericPageSize}`;

    if (isDefaultQuery) {
      try {
        let cachedData = redisClient.status === 'ready' ? await redisClient.get(pageCacheKey) : null;
        if (cachedData) {
          logger.debug(`Product catalogue page cache HIT for shop: ${shopId}, page: ${numericPage}`);
          return res.json(JSON.parse(cachedData));
        }

        cachedData = redisClient.status === 'ready' ? await redisClient.get(cacheKey) : null;
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

      logger.debug(`Product catalogue cache MISS for shop: ${shopId}, querying database with pagination`);
      try {
        const catalogWhere = { active: true };
        if (organizationId) {
          catalogWhere.organizationId = organizationId;
        } else {
          catalogWhere.shopId = shopId;
        }

        const pageResult = await Product.findAndCountAll({
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
          limit: numericPageSize,
          offset,
          distinct: true,
        });

        const formattedRows = pageResult.rows.map(p => formatProductWithInventory(p));
        const totalPages = Math.ceil(pageResult.count / numericPageSize) || 1;
        const responseData = {
          products: formattedRows,
          searchType: 'exact',
          pagination: {
            currentPage: numericPage,
            totalPages,
            total: pageResult.count,
          },
        };

        try {
          if (redisClient.status === 'ready') {
            await redisClient.setex(pageCacheKey, 300, JSON.stringify(responseData));
          }
        } catch (err) {
          logger.warn(`Redis error caching products for shop ${shopId}:`, err);
        }

        return res.json(responseData);
      } catch (error) {
        console.error('Error fetching paginated products on cache miss:', error);
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
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    let finalSku = sku ? String(sku).trim() : '';
    let finalBarcode = barcode ? String(barcode).trim() : '';
    let finalReorderPoint = (reorderPoint !== undefined && reorderPoint !== null && reorderPoint !== '')
      ? parseInt(reorderPoint, 10)
      : null;

    const settings = await SystemSettings.findOne({ where: { shopId } });
    const skuPrefix = settings?.skuPrefix || 'SKU';
    const barcodeFormat = settings?.barcodeFormat || 'EAN13';
    const defaultLowStock = settings?.lowStockThreshold !== undefined ? settings.lowStockThreshold : 10;

    if (finalReorderPoint === null) {
      finalReorderPoint = defaultLowStock;
    }

    const isAutoSku = !finalSku;
    const isAutoBarcode = !finalBarcode;

    if (isAutoSku) {
      const count = organizationId
        ? await Product.count({ where: { organizationId } })
        : await Product.count({ where: { shopId } });
      finalSku = generateSKU(skuPrefix, count + 1);
    }
    if (isAutoBarcode) {
      finalBarcode = generateBarcode(barcodeFormat);
    }

    const targetCategoryId = categoryId || CategoryId;
    const parsedCategoryId = targetCategoryId ? parseInt(targetCategoryId, 10) : null;

    // Validate category tenant ownership
    if (parsedCategoryId) {
      const categoryWhere = { id: parsedCategoryId, active: true };
      if (organizationId) {
        categoryWhere.organizationId = organizationId;
      } else if (shopId) {
        categoryWhere.shopId = shopId;
      }
      const category = await Category.findOne({ where: categoryWhere });
      if (!category) {
        return res.status(400).json({ error: 'Invalid category for organization' });
      }
    }

    const initialStock = (stockQuantity !== undefined && stockQuantity !== null && stockQuantity !== '')
      ? parseFloat(stockQuantity)
      : 0;
    const initialReorder = (finalReorderPoint !== undefined && finalReorderPoint !== null && finalReorderPoint !== '')
      ? parseInt(finalReorderPoint, 10)
      : 10;

    let productWithCategory = null;
    const maxAttempts = (isAutoSku || isAutoBarcode) ? 3 : 1;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt++;
      let currentSku = finalSku;
      let currentBarcode = finalBarcode;

      if (attempt > 1) {
        if (isAutoSku) {
          const currentCount = organizationId
            ? await Product.count({ where: { organizationId } })
            : await Product.count({ where: { shopId } });
          currentSku = generateSKU(skuPrefix, currentCount + attempt + Math.floor(Math.random() * 100));
        }
        if (isAutoBarcode) {
          currentBarcode = generateBarcode(barcodeFormat);
        }
      }

      try {
        await sequelize.transaction(async (t) => {
          // 1. Create master catalog Product entry
          const product = await Product.create({
            name,
            sku: currentSku,
            barcode: currentBarcode,
            description,
            price,
            cost,
            categoryId: parsedCategoryId,
            CategoryId: parsedCategoryId,
            expirationDate: expirationDate || null,
            weightGrams: typeof weightGrams === 'number' ? weightGrams : (weightGrams ? parseInt(weightGrams, 10) : null),
            shopId,
            organizationId
          }, { transaction: t });

          // 2. Explicitly provision branch Inventory row (no model hooks)
          if (shopId) {
            await Inventory.create({
              productId: product.id,
              shopId,
              stockQuantity: initialStock,
              reorderPoint: initialReorder
            }, { transaction: t });
          }

          productWithCategory = await Product.findOne({
            where: { id: product.id },
            include: [
              { model: Category, attributes: ['id', 'name'] },
              {
                model: Inventory,
                attributes: ['stockQuantity', 'reorderPoint', 'shopId'],
                where: { shopId },
                required: false
              }
            ],
            transaction: t
          });
        });

        finalSku = currentSku;
        finalBarcode = currentBarcode;
        break; // Success!
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError' && attempt < maxAttempts && (isAutoSku || isAutoBarcode)) {
          logger.warn(`[createProduct] Identifier collision on attempt ${attempt}. Retrying with fresh identifier...`);
          continue;
        }
        throw err;
      }
    }

    if (shopId) {
      await invalidateShopProductCache(shopId);
    }

    res.status(201).json(formatProductWithInventory(productWithCategory));
    try {
      await logActivity({
        shopId: req.shopId || req.user?.shopId,
        performedBy: req.user?.id,
        performedByType: req.user?.isEmployee ? 'employee' : 'user',
        action: 'PRODUCT_CREATED',
        entity: 'Product',
        entityId: productWithCategory?.id,
        details: `SKU: ${finalSku}`
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

    const shopId = req.shopId || req.user?.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const targetProductWhere = { id: req.params.id, active: true };
    if (organizationId) {
      targetProductWhere.organizationId = organizationId;
    } else {
      targetProductWhere.shopId = req.user?.shopId;
    }

    const product = await Product.findOne({
      where: targetProductWhere
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    organizationId = organizationId || product.organizationId;

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
    let parsedCategoryId = undefined;
    if (targetCategoryId !== undefined) {
      parsedCategoryId = (targetCategoryId !== null && targetCategoryId !== '')
        ? parseInt(targetCategoryId, 10)
        : null;

      // Validate category tenant ownership if category is being updated
      if (parsedCategoryId) {
        const categoryWhere = { id: parsedCategoryId, active: true };
        if (organizationId) {
          categoryWhere.organizationId = organizationId;
        } else if (shopId) {
          categoryWhere.shopId = shopId;
        }
        const category = await Category.findOne({ where: categoryWhere });
        if (!category) {
          return res.status(400).json({ error: 'Invalid category for organization' });
        }
      }
    }

    const updateFields = {
      name,
      sku,
      barcode,
      description,
      price,
      cost,
      expirationDate: expirationDate || null,
      weightGrams: typeof weightGrams === 'number' ? weightGrams : (weightGrams ? parseInt(weightGrams, 10) : product.weightGrams)
    };
    if (parsedCategoryId !== undefined) {
      updateFields.categoryId = parsedCategoryId;
      updateFields.CategoryId = parsedCategoryId;
    }

    await product.update(updateFields);

    // Only update reorderPoint - stockQuantity mutations MUST go through stock adjustment API
    if (shopId && (reorderPoint !== undefined && reorderPoint !== null && reorderPoint !== '')) {
      const inventory = await Inventory.findOne({
        where: { productId: product.id, shopId }
      });
      if (inventory) {
        await inventory.update({ reorderPoint: parseInt(reorderPoint, 10) });
      }
    }

    if (organizationId) {
      await invalidateOrgProductCaches(organizationId);
    } else if (shopId) {
      await invalidateShopProductCache(shopId);
    }

    const updatedProduct = await Product.findOne({
      where: { id: product.id },
      include: [
        { model: Category, attributes: ['id', 'name'] },
        {
          model: Inventory,
          attributes: ['stockQuantity', 'reorderPoint', 'shopId'],
          where: { shopId },
          required: false
        }
      ]
    });

    res.json(formatProductWithInventory(updatedProduct));
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
    const shopId = req.shopId || req.user?.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const deleteWhere = { id: req.params.id, active: true };
    if (organizationId) {
      deleteWhere.organizationId = organizationId;
    } else {
      deleteWhere.shopId = req.user?.shopId;
    }

    const product = await Product.findOne({
      where: deleteWhere
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    organizationId = organizationId || product.organizationId;

    await product.update({ active: false });
    if (organizationId) {
      await invalidateOrgProductCaches(organizationId);
    } else if (shopId) {
      await invalidateShopProductCache(shopId);
    }
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
    const shopId = req.shopId || req.user?.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const productWhere = { id: req.params.id, active: true };
    if (organizationId) {
      productWhere.organizationId = organizationId;
    } else {
      productWhere.shopId = shopId;
    }

    let resultProduct = null;
    await sequelize.transaction(async (t) => {
      // 1. Lock Product row
      const product = await Product.findOne({
        where: productWhere,
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!product) {
        const notFoundErr = new Error('Product not found');
        notFoundErr.status = 404;
        throw notFoundErr;
      }

      // 2. Lock Inventory row for (shopId, productId)
      let inventory = await Inventory.findOne({
        where: { productId: product.id, shopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!inventory) {
        logger.warn(`[productController:updateStock] Explicitly creating missing Inventory row for productId=${product.id}, shopId=${shopId}`);
        inventory = await Inventory.create({
          productId: product.id,
          shopId,
          stockQuantity: 0,
          reorderPoint: 10
        }, { transaction: t });
      }

      const delta = parseInt(quantity, 10);
      const prevStock = parseFloat(inventory.stockQuantity || 0);
      const newQuantity = Math.round((prevStock + delta) * 100) / 100;
      if (newQuantity < 0) {
        const badReqErr = new Error('Insufficient stock');
        badReqErr.status = 400;
        throw badReqErr;
      }

      // 3. Mutate Inventory.stockQuantity
      await inventory.update({ stockQuantity: newQuantity }, { transaction: t });

      // 5. Create StockMovement audit entry based on Inventory values
      const isEmployee = Boolean(req.user?.isEmployee);
      const employeeId = isEmployee ? (req.user?.id || req.user?.employeeId) : null;
      let validUserId = null;
      if (!isEmployee && req.user?.id) {
        const existingUser = await User.findByPk(req.user.id, { attributes: ['id'], transaction: t });
        if (existingUser) validUserId = existingUser.id;
      }

      await StockMovement.create({
        shopId,
        organizationId: organizationId || product.organizationId,
        productId: product.id,
        quantity: delta,
        previousStock: prevStock,
        newStock: newQuantity,
        type: 'ADJUSTMENT',
        reference: `MANUAL_ADJUSTMENT_${Date.now()}`,
        notes: `Manual stock adjustment of ${delta >= 0 ? '+' : ''}${delta}`,
        userId: validUserId,
        employeeId
      }, { transaction: t });

      resultProduct = await Product.findOne({
        where: { id: product.id },
        include: [
          { model: Category, attributes: ['id', 'name'], required: false },
          {
            model: Inventory,
            attributes: ['stockQuantity', 'reorderPoint', 'shopId'],
            where: { shopId },
            required: false
          }
        ],
        transaction: t
      });
    });

    if (shopId) {
      await invalidateShopProductCache(shopId);
    }

    res.json(formatProductWithInventory(resultProduct));

    try {
      await logActivity({
        shopId: req.shopId || req.user?.shopId,
        performedBy: req.user?.id,
        performedByType: req.user?.isEmployee ? 'employee' : 'user',
        action: 'STOCK_ADJUSTED',
        entity: 'Product',
        entityId: req.params.id,
        details: `Delta: ${quantity}`
      });
    } catch (_) {}
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (error.status === 400) {
      return res.status(400).json({ error: error.message || 'Insufficient stock' });
    }
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
      attributes: ['id', 'name', 'sku', 'price', 'active'],
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

// Import products from CSV/Excel file
exports.importProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const shopId = req.shopId || req.user?.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;
    if (!organizationId && shopId) {
      const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    if (!organizationId && !shopId) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Tenant context required' });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let products = [];
    
    // Parse the file based on extension using ExcelJS
    try {
      const workbook = new ExcelJS.Workbook();
      if (fileExt === '.csv') {
        await workbook.csv.readFile(filePath);
      } else if (fileExt === '.xlsx') {
        await workbook.xlsx.readFile(filePath);
      } else {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Unsupported file format. Only CSV and XLSX are supported.' });
      }

      const worksheet = workbook.worksheets[0];
      if (worksheet) {
        const headers = [];
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          headers[colNumber] = String(cell.value || '').trim();
        });

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // skip header row
          const rowData = {};
          let hasData = false;
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              let val = cell.value;
              if (val && typeof val === 'object') {
                if (val.result !== undefined) val = val.result;
                else if (val.text !== undefined) val = val.text;
                else if (val instanceof Date) val = val.toISOString().split('T')[0];
              }
              if (val !== undefined && val !== null && String(val).trim() !== '') {
                hasData = true;
                rowData[header] = typeof val === 'string' ? val.trim() : val;
              }
            }
          });
          if (hasData) {
            products.push(rowData);
          }
        });
      }
    } catch (parseError) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      logger.warn(`[productController:import] Failed to parse spreadsheet: ${parseError.message}`);
      return res.status(400).json({ error: 'Failed to parse file. The file may be corrupt or improperly formatted.' });
    }

    // Clean up the uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    if (!products || products.length === 0) {
      return res.status(400).json({ error: 'No products found in file' });
    }

    // Validate and process products
    const errors = [];
    const warnings = [];
    const successfulProducts = [];
    const skippedProducts = [];
    const createdCategories = [];

    // Get settings for defaults
    const settings = await SystemSettings.findOne({ where: { shopId } });
    const skuPrefix = settings?.skuPrefix || 'SKU';
    const barcodeFormat = settings?.barcodeFormat || 'EAN13';
    const defaultLowStock = settings?.lowStockThreshold !== undefined ? settings.lowStockThreshold : 10;

    // Get existing SKUs and barcodes to prevent duplicates
    const existingProducts = await Product.findAll({
      where: { organizationId },
      attributes: ['sku', 'barcode']
    });
    const existingSkus = new Set(existingProducts.map(p => p.sku));
    const existingBarcodes = new Set(existingProducts.map(p => p.barcode).filter(b => b));

    // Get all categories for validation
    const categoryWhere = { active: true };
    if (organizationId) {
      categoryWhere.organizationId = organizationId;
    } else if (shopId) {
      categoryWhere.shopId = shopId;
    }
    const categories = await Category.findAll({
      where: categoryWhere,
      attributes: ['id', 'name']
    });
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase().trim(), c.id]));

    for (let i = 0; i < products.length; i++) {
      const row = products[i];
      const rowNumber = i + 2; // Excel row numbers start from 1, header is row 1

      try {
        const normaliseKey = (k) => String(k || '')
          .toLowerCase()
          .replace(/\(.*?\)/g, '')
          .replace(/[^a-z0-9]/g, '');

        const normaliseKeyRaw = (k) => String(k || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');

        const rowNorm = {};
        for (const [k, v] of Object.entries(row)) {
          if (v === undefined || v === null || String(v).trim() === '') continue;
          rowNorm[normaliseKey(k)] = v;
          rowNorm[normaliseKeyRaw(k)] = v;
        }

        const getVal = (...aliases) => {
          for (const alias of aliases) {
            if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
              return row[alias];
            }
            const norm = normaliseKey(alias);
            if (rowNorm[norm] !== undefined) return rowNorm[norm];
            const raw = normaliseKeyRaw(alias);
            if (rowNorm[raw] !== undefined) return rowNorm[raw];
          }
          return undefined;
        };

        // Map column names (handle different naming conventions and normalized headers)
        const name = getVal('name', 'Name', 'Product Name', 'product_name');
        const sku = getVal('sku', 'SKU', 'Sku');
        const barcode = getVal('barcode', 'Barcode', 'Bar Code', 'bar_code');
        const description = getVal('description', 'Description', 'desc');
        const price = getVal('price', 'Price', 'Selling Price', 'selling_price', 'unit price', 'selling price', 'Price (KES)');
        const cost = getVal('cost', 'Cost', 'Cost Price', 'cost_price', 'buying price', 'unit cost');
        const stockQuantity = getVal('stockQuantity', 'Stock Quantity', 'stock_quantity', 'quantity', 'qty', 'stock');
        const reorderPoint = getVal('reorderPoint', 'Reorder Point', 'reorder_point');
        const categoryName = getVal('category', 'Category', 'category_name');
        const weightGrams = getVal('weightGrams', 'Weight', 'weight_grams');
        const expirationDate = getVal('expirationDate', 'Expiration Date', 'expiration_date');

        // Validate required fields
        if (!name) {
          errors.push({ row: rowNumber, field: 'name', message: 'Product name is required' });
          skippedProducts.push(row);
          continue;
        }

        if (!price || isNaN(parseFloat(price))) {
          errors.push({ row: rowNumber, field: 'price', message: 'Valid price is required' });
          skippedProducts.push(row);
          continue;
        }

        let parsedCost = 0;
        if (cost === undefined || cost === null || String(cost).trim() === '') {
          parsedCost = 0;
          warnings.push({ row: rowNumber, field: 'cost', message: `Row ${rowNumber}: cost is missing; defaulted to 0` });
        } else if (isNaN(parseFloat(cost))) {
          errors.push({ row: rowNumber, field: 'cost', message: 'Valid cost is required' });
          skippedProducts.push(row);
          continue;
        } else {
          parsedCost = parseFloat(cost);
        }

        // Handle SKU
        let finalSku = sku ? String(sku).trim() : '';
        if (!finalSku) {
          const count = await Product.count({ where: { organizationId } });
          finalSku = `${skuPrefix}${String(count + 1).padStart(4, '0')}`;
        }

        if (existingSkus.has(finalSku)) {
          errors.push({ row: rowNumber, field: 'sku', message: `SKU ${finalSku} already exists` });
          skippedProducts.push(row);
          continue;
        }

        // Handle barcode
        let finalBarcode = barcode ? String(barcode).trim() : '';
        if (finalBarcode && existingBarcodes.has(finalBarcode)) {
          errors.push({ row: rowNumber, field: 'barcode', message: `Barcode ${finalBarcode} already exists` });
          skippedProducts.push(row);
          continue;
        }

        // Parse and validate weightGrams
        let parsedWeightGrams = null;
        if (weightGrams !== undefined && weightGrams !== null && String(weightGrams).trim() !== '') {
          const parsed = parseInt(weightGrams, 10);
          if (isNaN(parsed) || parsed < 0) {
            errors.push({ row: rowNumber, field: 'weightGrams', message: 'Valid weight in grams is required' });
            skippedProducts.push(row);
            continue;
          }
          parsedWeightGrams = parsed;
        }

        // Parse and validate expirationDate
        let parsedExpirationDate = null;
        if (expirationDate !== undefined && expirationDate !== null && String(expirationDate).trim() !== '') {
          const d = new Date(expirationDate);
          if (isNaN(d.getTime())) {
            errors.push({ row: rowNumber, field: 'expirationDate', message: 'Valid expiration date is required' });
            skippedProducts.push(row);
            continue;
          }
          parsedExpirationDate = d;
        }

        // Handle category (auto-create or reactivate missing categories up to 50 cap)
        let categoryId = null;
        if (categoryName) {
          const trimmedCatName = String(categoryName).trim();
          const catKey = trimmedCatName.toLowerCase();
          const existingCatId = categoryMap.get(catKey);

          if (existingCatId) {
            categoryId = existingCatId;
          } else {
            if (createdCategories.length >= 50) {
              errors.push({ row: rowNumber, field: 'category', message: 'too many new categories; create them first' });
              skippedProducts.push(row);
              continue;
            }

            let catShopId = shopId;
            if (!catShopId && organizationId) {
              const defaultShop = await Shop.findOne({ where: { organizationId, active: true }, attributes: ['id'] });
              catShopId = defaultShop?.id;
            }

            try {
              const [newCategory, wasCreated] = await Category.findOrCreate({
                where: {
                  name: trimmedCatName,
                  ...(organizationId ? { organizationId } : { shopId: catShopId })
                },
                defaults: {
                  name: trimmedCatName,
                  shopId: catShopId,
                  organizationId,
                  active: true
                }
              });

              const wasInactive = newCategory.active === false;
              if (wasInactive) {
                await newCategory.update({ active: true });
              }

              categoryId = newCategory.id;
              categoryMap.set(catKey, newCategory.id);
              if ((wasCreated || wasInactive) && !createdCategories.includes(newCategory.name) && createdCategories.length < 50) {
                createdCategories.push(newCategory.name);
              }
            } catch (catErr) {
              const existing = await Category.findOne({
                where: {
                  name: trimmedCatName,
                  ...(organizationId ? { organizationId } : { shopId: catShopId })
                }
              });
              if (existing) {
                const wasInactive = existing.active === false;
                if (wasInactive) {
                  await existing.update({ active: true });
                }
                categoryId = existing.id;
                categoryMap.set(catKey, existing.id);
                if (wasInactive && !createdCategories.includes(existing.name) && createdCategories.length < 50) {
                  createdCategories.push(existing.name);
                }
              } else {
                errors.push({ row: rowNumber, field: 'category', message: `Failed to create category "${trimmedCatName}": ${catErr.message}` });
                skippedProducts.push(row);
                continue;
              }
            }
          }
        }

        // Create product
        const productData = {
          name: String(name).trim(),
          sku: finalSku,
          barcode: finalBarcode || null,
          description: description ? String(description).trim() : null,
          price: parseFloat(price),
          cost: parsedCost,
          categoryId: categoryId,
          CategoryId: categoryId,
          organizationId,
          shopId: organizationId ? null : shopId,
          weightGrams: parsedWeightGrams,
          expirationDate: parsedExpirationDate
        };

        const product = await Product.create(productData);

        // Create inventory entry if shopId exists
        if (shopId) {
          const initialStock = stockQuantity ? parseFloat(stockQuantity) : 0;
          const initialReorder = reorderPoint ? parseInt(reorderPoint, 10) : defaultLowStock;

          await Inventory.create({
            productId: product.id,
            shopId,
            stockQuantity: initialStock,
            reorderPoint: initialReorder
          });
        }

        successfulProducts.push({
          row: rowNumber,
          name: product.name,
          sku: product.sku,
          id: product.id
        });

        existingSkus.add(finalSku);
        if (finalBarcode) existingBarcodes.add(finalBarcode);

      } catch (error) {
        logger.error(`Error processing row ${rowNumber}:`, error);
        errors.push({ row: rowNumber, message: error.message });
        skippedProducts.push(row);
      }
    }

    // Invalidate cache
    if (organizationId) {
      await invalidateOrgProductCaches(organizationId);
    } else if (shopId) {
      await invalidateShopProductCache(shopId);
    }

    const isSuccess = successfulProducts.length > 0;
    const message = isSuccess
      ? `Import completed. ${successfulProducts.length} products imported successfully.`
      : `0 products imported, ${skippedProducts.length} rows skipped. See errors below.`;

    res.json({
      success: isSuccess,
      message,
      summary: {
        total: products.length,
        successful: successfulProducts.length,
        skipped: skippedProducts.length,
        errors: errors.length,
        warnings: warnings.length
      },
      successfulProducts,
      errors,
      warnings,
      createdCategories
    });

  } catch (error) {
    logger.error('Error importing products:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ error: 'Failed to import products', details: error.message });
  }
};
