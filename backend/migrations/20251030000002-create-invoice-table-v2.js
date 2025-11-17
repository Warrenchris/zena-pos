'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Ensure required tables exist
    const requiredTables = ['shops', 'users', 'employees', 'customers'];
    for (const tableName of requiredTables) {
      const [tableExists] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = '${tableName}'`
      );
      
      if (tableExists.length === 0) {
        // Create missing table with minimal structure
        switch (tableName) {
          case 'shops':
            await queryInterface.createTable('shops', {
              id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
              },
              name: {
                type: Sequelize.STRING,
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
            break;
          case 'employees':
            await queryInterface.createTable('employees', {
              id: {
                type: Sequelize.CHAR(36),
                primaryKey: true
              },
              name: {
                type: Sequelize.STRING,
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
            break;
          case 'customers':
            await queryInterface.createTable('customers', {
              id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
              },
              name: {
                type: Sequelize.STRING,
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
            break;
          // Users table was already created in previous migration
        }
      }
    }

    // Drop the invoices table if it exists since we're doing a complete restructure
    await queryInterface.dropTable('invoices').catch(() => {
      // Ignore error if table doesn't exist
    });

    // Create the new table structure
    await queryInterface.createTable('invoices', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      invoiceNumber: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      subtotal: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      tax: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },
      taxRate: {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 0
      },
      discount: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },
      discountType: {
        type: Sequelize.STRING,
        allowNull: true
      },
      discountValue: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      total: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      paymentMethod: {
        type: Sequelize.STRING,
        allowNull: false
      },
      paymentAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      change: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0
      },
      paymentReference: {
        type: Sequelize.STRING,
        allowNull: true
      },
      paymentProvider: {
        type: Sequelize.STRING,
        allowNull: true
      },
      paymentNotes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      customerNotes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      deliveryAddress: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      deliveryInstructions: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      preferredLanguage: {
        type: Sequelize.STRING,
        defaultValue: 'en'
      },
      source: {
        type: Sequelize.STRING,
        defaultValue: 'pos'
      },
      status: {
        type: Sequelize.STRING,
        defaultValue: 'completed'
      },
      fulfillmentStatus: {
        type: Sequelize.STRING,
        defaultValue: 'collected'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      },
      tags: {
        type: Sequelize.JSON,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      processedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      cancelledAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      refundedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      lastModifiedBy: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customerName: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customerLocation: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customerPhone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      customerEmail: {
        type: Sequelize.STRING,
        allowNull: true
      },
      shopId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'shops',
          key: 'id'
        }
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      employeeId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        }
      },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'customers',
          key: 'id'
        }
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

    // Add indexes - with error handling
    const indexColumns = [
      ['invoiceNumber'],
      ['shopId'],
      ['customerId'],
      ['status'],
      ['createdAt']
    ];
    
    for (const cols of indexColumns) {
      try {
        await queryInterface.addIndex('invoices', cols);
      } catch (error) {
        console.log(`Index on ${cols.join(',')} skipped:`, error.message);
      }
    }
    
    // Try to add employeeId index only if column exists
    try {
      const [columns] = await queryInterface.sequelize.query(
        `SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'invoices' AND COLUMN_NAME = 'employeeId'`
      );
      if (columns.length > 0) {
        await queryInterface.addIndex('invoices', ['employeeId']);
      }
    } catch (error) {
      console.log('employeeId index skipped:', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('invoices');
  }
};