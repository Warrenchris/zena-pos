'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // 1. Enhance Sales table with new fields
      const salesEnhancements = [
        // Payment and financial tracking
        ['paymentReference', { type: Sequelize.STRING, allowNull: true }],
        ['paymentProvider', { type: Sequelize.STRING, allowNull: true }],
        ['paymentNotes', { type: Sequelize.TEXT, allowNull: true }],
        ['taxRate', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0.00 }],
        ['discountType', { type: Sequelize.ENUM('percentage', 'fixed'), allowNull: true }],
        ['discountValue', { type: Sequelize.DECIMAL(10, 2), allowNull: true }],
        
        // Customer experience
        ['customerNotes', { type: Sequelize.TEXT, allowNull: true }],
        ['deliveryAddress', { type: Sequelize.TEXT, allowNull: true }],
        ['deliveryInstructions', { type: Sequelize.TEXT, allowNull: true }],
        ['preferredLanguage', { type: Sequelize.STRING(5), allowNull: true, defaultValue: 'en' }],
        
        // Business operations
        ['source', { type: Sequelize.ENUM('pos', 'online', 'phone', 'mobile_app'), defaultValue: 'pos' }],
        ['saleStatus', { 
          type: Sequelize.ENUM(
            'pending', 
            'confirmed', 
            'processing', 
            'completed', 
            'cancelled', 
            'refunded', 
            'partially_refunded'
          ), 
          defaultValue: 'completed' 
        }],
        ['fulfillmentStatus', { 
          type: Sequelize.ENUM(
            'pending', 
            'processing', 
            'ready', 
            'delivered', 
            'collected', 
            'failed'
          ), 
          defaultValue: 'collected' 
        }],
        
        // Metadata
        ['metadata', { type: Sequelize.JSON, allowNull: true }],
        ['tags', { type: Sequelize.JSON, allowNull: true }],
        ['notes', { type: Sequelize.TEXT, allowNull: true }],
        
        // Tracking
        ['processedAt', { type: Sequelize.DATE, allowNull: true }],
        ['completedAt', { type: Sequelize.DATE, allowNull: true }],
        ['cancelledAt', { type: Sequelize.DATE, allowNull: true }],
        ['refundedAt', { type: Sequelize.DATE, allowNull: true }],
        ['lastModifiedBy', { type: Sequelize.UUID, allowNull: true }]
      ];

      for (const [columnName, columnDefinition] of salesEnhancements) {
        try {
          await queryInterface.addColumn('Sales', columnName, columnDefinition);
          console.log('Added column:', columnName);
        } catch (error) {
          console.log('Column already exists:', columnName);
        }
      }

      // 2. Enhance SaleItems table with new fields
      const saleItemsEnhancements = [
        ['originalPrice', { type: Sequelize.DECIMAL(10, 2), allowNull: true }],
        ['discountType', { type: Sequelize.ENUM('percentage', 'fixed'), allowNull: true }],
        ['discountValue', { type: Sequelize.DECIMAL(10, 2), allowNull: true }],
        ['taxRate', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0.00 }],
        ['taxAmount', { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0.00 }],
        ['notes', { type: Sequelize.TEXT, allowNull: true }],
        ['metadata', { type: Sequelize.JSON, allowNull: true }],
        ['returnReason', { type: Sequelize.STRING, allowNull: true }],
        ['serialNumber', { type: Sequelize.STRING, allowNull: true }],
        ['batchNumber', { type: Sequelize.STRING, allowNull: true }]
      ];

      for (const [columnName, columnDefinition] of saleItemsEnhancements) {
        try {
          await queryInterface.addColumn('SaleItems', columnName, columnDefinition);
          console.log('Added column to SaleItems:', columnName);
        } catch (error) {
          console.log('Column already exists in SaleItems:', columnName);
        }
      }

      // 3. Create SaleRefunds table
      try {
        await queryInterface.createTable('SaleRefunds', {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          saleId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Sales',
              key: 'id'
            }
          },
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          refundMethod: {
            type: Sequelize.ENUM('cash', 'card', 'mobile_money', 'store_credit'),
            allowNull: false
          },
          processedBy: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: 'Employees',
              key: 'id'
            }
          },
          status: {
            type: Sequelize.ENUM('pending', 'processed', 'failed'),
            defaultValue: 'pending'
          },
          metadata: {
            type: Sequelize.JSON,
            allowNull: true
          },
          shopId: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        console.log('Created SaleRefunds table');
      } catch (error) {
        console.log('SaleRefunds table already exists');
      }

      // 4. Create SalePayments table for split payments
      try {
        await queryInterface.createTable('SalePayments', {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          saleId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'Sales',
              key: 'id'
            }
          },
          amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false
          },
          paymentMethod: {
            type: Sequelize.ENUM('cash', 'card', 'mobile', 'mobile_money', 'check', 'store_credit'),
            allowNull: false
          },
          paymentReference: {
            type: Sequelize.STRING,
            allowNull: true
          },
          paymentProvider: {
            type: Sequelize.STRING,
            allowNull: true
          },
          status: {
            type: Sequelize.ENUM('pending', 'completed', 'failed', 'refunded'),
            defaultValue: 'completed'
          },
          processedBy: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: 'Employees',
              key: 'id'
            }
          },
          metadata: {
            type: Sequelize.JSON,
            allowNull: true
          },
          shopId: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        console.log('Created SalePayments table');
      } catch (error) {
        console.log('SalePayments table already exists');
      }

      // 5. Create indexes for better performance
      const indexes = [
        ['Sales', ['status'], 'idx_sales_status'],
        ['Sales', ['createdAt'], 'idx_sales_created_at'],
        ['Sales', ['paymentMethod'], 'idx_sales_payment_method'],
        ['Sales', ['customerId'], 'idx_sales_customer_id'],
        ['Sales', ['employeeId'], 'idx_sales_employee_id'],
        ['SaleItems', ['productId'], 'idx_sale_items_product_id'],
        ['SaleItems', ['saleId'], 'idx_sale_items_sale_id'],
        ['SaleRefunds', ['saleId'], 'idx_refunds_sale_id'],
        ['SaleRefunds', ['status'], 'idx_refunds_status'],
        ['SalePayments', ['saleId'], 'idx_payments_sale_id'],
        ['SalePayments', ['status'], 'idx_payments_status']
      ];

      for (const [table, fields, indexName] of indexes) {
        try {
          await queryInterface.addIndex(table, fields, {
            name: indexName
          });
          console.log('Added index:', indexName);
        } catch (error) {
          console.log('Index already exists:', indexName);
        }
      }

      console.log('Migration completed successfully');

    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Remove indexes
      const indexes = [
        ['Sales', 'idx_sales_status'],
        ['Sales', 'idx_sales_created_at'],
        ['Sales', 'idx_sales_payment_method'],
        ['Sales', 'idx_sales_customer_id'],
        ['Sales', 'idx_sales_employee_id'],
        ['SaleItems', 'idx_sale_items_product_id'],
        ['SaleItems', 'idx_sale_items_sale_id'],
        ['SaleRefunds', 'idx_refunds_sale_id'],
        ['SaleRefunds', 'idx_refunds_status'],
        ['SalePayments', 'idx_payments_sale_id'],
        ['SalePayments', 'idx_payments_status']
      ];

      for (const [table, indexName] of indexes) {
        try {
          await queryInterface.removeIndex(table, indexName);
          console.log('Removed index:', indexName);
        } catch (error) {
          console.log('Index removal failed:', indexName);
        }
      }

      // Drop new tables
      await queryInterface.dropTable('SalePayments');
      await queryInterface.dropTable('SaleRefunds');

      // Remove columns from SaleItems
      const saleItemsColumns = [
        'originalPrice', 'discountType', 'discountValue', 'taxRate', 'taxAmount',
        'notes', 'metadata', 'returnReason', 'serialNumber', 'batchNumber'
      ];

      for (const column of saleItemsColumns) {
        try {
          await queryInterface.removeColumn('SaleItems', column);
          console.log('Removed column from SaleItems:', column);
        } catch (error) {
          console.log('Column removal failed:', column);
        }
      }

      // Remove columns from Sales
      const salesColumns = [
        'paymentReference', 'paymentProvider', 'paymentNotes', 'taxRate',
        'discountType', 'discountValue', 'customerNotes', 'deliveryAddress',
        'deliveryInstructions', 'preferredLanguage', 'source', 'saleStatus',
        'fulfillmentStatus', 'metadata', 'tags', 'notes', 'processedAt',
        'completedAt', 'cancelledAt', 'refundedAt', 'lastModifiedBy'
      ];

      for (const column of salesColumns) {
        try {
          await queryInterface.removeColumn('Sales', column);
          console.log('Removed column from Sales:', column);
        } catch (error) {
          console.log('Column removal failed:', column);
        }
      }

      console.log('Migration reversal completed successfully');
    } catch (error) {
      console.error('Migration reversal failed:', error);
      throw error;
    }
  }
};