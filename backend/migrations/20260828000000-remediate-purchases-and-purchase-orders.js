'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Backfill existing Purchases where shopId IS NULL (verified to belong to Shop 1 Product 186)
    try {
      await queryInterface.sequelize.query(
        "UPDATE Purchases SET shopId = 1 WHERE shopId IS NULL"
      );
    } catch (e) {
      console.warn('Note on backfilling Purchases shopId:', e.message);
    }

    try {
      await queryInterface.sequelize.query(
        "UPDATE PurchaseOrders SET shopId = 1 WHERE shopId IS NULL"
      );
    } catch (e) {
      console.warn('Note on backfilling PurchaseOrders shopId:', e.message);
    }

    // 2. Enforce NOT NULL on shopId in Purchases & PurchaseOrders
    try {
      await queryInterface.sequelize.query('ALTER TABLE Purchases DROP FOREIGN KEY Purchases_ibfk_1;').catch(() => {});
      await queryInterface.changeColumn('Purchases', 'shopId', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Shops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });
    } catch (e) {
      console.warn('Note on Purchases.shopId changeColumn:', e.message);
    }

    try {
      await queryInterface.sequelize.query('ALTER TABLE PurchaseOrders DROP FOREIGN KEY PurchaseOrders_ibfk_1;').catch(() => {});
      await queryInterface.changeColumn('PurchaseOrders', 'shopId', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'Shops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });
    } catch (e) {
      console.warn('Note on PurchaseOrders.shopId changeColumn:', e.message);
    }

    // 3. Create Suppliers table if not exists
    try {
      await queryInterface.createTable('Suppliers', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING, allowNull: false },
        contactPerson: { type: Sequelize.STRING, allowNull: true },
        email: { type: Sequelize.STRING, allowNull: true },
        phone: { type: Sequelize.STRING, allowNull: true },
        address: { type: Sequelize.TEXT, allowNull: true },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { engine: 'InnoDB' });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
    }
    try { await queryInterface.addIndex('Suppliers', ['shopId', 'name'], { name: 'suppliers_shop_name_idx' }); } catch (e) {}

    // 4. Create StockMovements table if not exists
    try {
      await queryInterface.createTable('StockMovements', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        productId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Products', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        previousStock: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        newStock: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        type: {
          type: Sequelize.ENUM('PURCHASE_RECEIPT', 'PURCHASE_REVERSAL', 'SALE', 'SALE_REFUND', 'ADJUSTMENT', 'TRANSFER'),
          allowNull: false
        },
        reference: { type: Sequelize.STRING, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { engine: 'InnoDB' });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
    }
    try { await queryInterface.addIndex('StockMovements', ['shopId', 'productId'], { name: 'stock_movements_shop_product_idx' }); } catch (e) {}

    // 5. Add supplierId and paidAmount to Purchases if missing
    try {
      await queryInterface.addColumn('Purchases', 'supplierId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Suppliers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    } catch (e) {}

    try {
      await queryInterface.addColumn('Purchases', 'paidAmount', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0.00
      });
      // Backfill paidAmount for existing PAID purchases
      await queryInterface.sequelize.query(
        "UPDATE Purchases SET paidAmount = totalAmount WHERE paymentStatus = 'PAID'"
      );
    } catch (e) {}

    // Add supplierId to PurchaseOrders if missing
    try {
      await queryInterface.addColumn('PurchaseOrders', 'supplierId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Suppliers', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    } catch (e) {}

    // 6. Create PurchaseItems table
    try {
      await queryInterface.createTable('PurchaseItems', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        purchaseId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Purchases', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        productId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Products', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        productName: { type: Sequelize.STRING, allowNull: false },
        sku: { type: Sequelize.STRING, allowNull: true },
        quantity: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        unitCost: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        totalCost: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { engine: 'InnoDB' });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
    }
    try { await queryInterface.addIndex('PurchaseItems', ['purchaseId'], { name: 'purchase_items_purchase_idx' }); } catch (e) {}
    try { await queryInterface.addIndex('PurchaseItems', ['shopId'], { name: 'purchase_items_shop_idx' }); } catch (e) {}

    // 7. Create PurchaseOrderItems table
    try {
      await queryInterface.createTable('PurchaseOrderItems', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        purchaseOrderId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'PurchaseOrders', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        productId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'Products', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        productName: { type: Sequelize.STRING, allowNull: false },
        sku: { type: Sequelize.STRING, allowNull: true },
        quantityOrdered: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        quantityReceived: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 },
        unitCost: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'Shops', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { engine: 'InnoDB' });
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
    }
    try { await queryInterface.addIndex('PurchaseOrderItems', ['purchaseOrderId'], { name: 'po_items_po_idx' }); } catch (e) {}
    try { await queryInterface.addIndex('PurchaseOrderItems', ['shopId'], { name: 'po_items_shop_idx' }); } catch (e) {}

    // 8. Backfill PurchaseItems from existing Purchases.items JSON
    try {
      const [purchases] = await queryInterface.sequelize.query(
        "SELECT id, items, shopId, createdAt, updatedAt FROM Purchases"
      );
      for (const p of purchases) {
        let itemsArr = [];
        try {
          itemsArr = typeof p.items === 'string' ? JSON.parse(p.items) : (p.items || []);
        } catch (_) {}

        if (Array.isArray(itemsArr)) {
          for (const item of itemsArr) {
            await queryInterface.sequelize.query(
              `INSERT INTO PurchaseItems (purchaseId, productId, productName, sku, quantity, unitCost, totalCost, shopId, createdAt, updatedAt)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              {
                replacements: [
                  p.id,
                  item.productId || null,
                  item.productName || 'Product',
                  item.sku || '',
                  parseFloat(item.quantity) || 1,
                  parseFloat(item.unitCost) || 0,
                  parseFloat(item.totalCost || (item.quantity * item.unitCost)) || 0,
                  p.shopId || 1,
                  p.createdAt || new Date(),
                  p.updatedAt || new Date()
                ]
              }
            );
          }
        }
      }
    } catch (err) {
      console.warn('Note on backfilling PurchaseItems:', err.message);
    }

    // 9. Backfill Suppliers from distinct Purchases supplierName
    try {
      await queryInterface.sequelize.query(
        `INSERT IGNORE INTO Suppliers (name, contactPerson, shopId, createdAt, updatedAt)
         SELECT DISTINCT supplierName, supplierContact, shopId, NOW(), NOW()
         FROM Purchases
         WHERE supplierName IS NOT NULL AND TRIM(supplierName) != ''`
      );
    } catch (e) {
      console.warn('Note on backfilling Suppliers:', e.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try { await queryInterface.dropTable('PurchaseOrderItems'); } catch (e) {}
    try { await queryInterface.dropTable('PurchaseItems'); } catch (e) {}
    try { await queryInterface.dropTable('StockMovements'); } catch (e) {}
    try { await queryInterface.dropTable('Suppliers'); } catch (e) {}
  }
};
