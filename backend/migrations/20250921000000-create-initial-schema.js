'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create Shops table
    await queryInterface.createTable('Shops', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      address: Sequelize.STRING,
      phone: Sequelize.STRING,
      active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Create other tables with shopId reference
    const commonFields = {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      shopId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Shops',
          key: 'id'
        },
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    };

    // Create Categories
    await queryInterface.createTable('Categories', {
      ...commonFields,
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: Sequelize.TEXT
    });

    // Create Products
    await queryInterface.createTable('Products', {
      ...commonFields,
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: Sequelize.TEXT,
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      categoryId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Categories',
          key: 'id'
        }
      }
    });

    // Create Customers
    await queryInterface.createTable('Customers', {
      ...commonFields,
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      email: Sequelize.STRING,
      phone: Sequelize.STRING,
      address: Sequelize.STRING
    });

    // Create Sales
    await queryInterface.createTable('Sales', {
      ...commonFields,
      customerId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Customers',
          key: 'id'
        }
      },
      totalAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'completed', 'cancelled'),
        defaultValue: 'completed'
      }
    });

    // Create SaleItems
    await queryInterface.createTable('SaleItems', {
      ...commonFields,
      saleId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Sales',
          key: 'id'
        },
        allowNull: false
      },
      productId: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Products',
          key: 'id'
        },
        allowNull: false
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      }
    });

    // Create Expenses
    await queryInterface.createTable('Expenses', {
      ...commonFields,
      description: {
        type: Sequelize.STRING,
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false
      },
      date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      category: Sequelize.STRING
    });

    // Create ActivityLogs
    await queryInterface.createTable('ActivityLogs', {
      ...commonFields,
      userId: Sequelize.INTEGER,
      action: {
        type: Sequelize.STRING,
        allowNull: false
      },
      details: Sequelize.TEXT
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop tables in reverse order
    await queryInterface.dropTable('ActivityLogs');
    await queryInterface.dropTable('Expenses');
    await queryInterface.dropTable('SaleItems');
    await queryInterface.dropTable('Sales');
    await queryInterface.dropTable('Customers');
    await queryInterface.dropTable('Products');
    await queryInterface.dropTable('Categories');
    await queryInterface.dropTable('Shops');
  }
};