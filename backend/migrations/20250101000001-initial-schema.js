const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create Users table
    await queryInterface.createTable('Users', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false
      },
      role: {
        type: DataTypes.ENUM('admin', 'manager', 'cashier'),
        defaultValue: 'cashier',
        allowNull: false
      },
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      shopId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create Employees table with correct roles
    await queryInterface.createTable('Employees', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      firstName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      lastName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true
      },
      position: {
        type: DataTypes.ENUM('admin', 'manager', 'cashier'),
        allowNull: false,
        defaultValue: 'cashier'
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active'
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false
      },
      salary: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      shopId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create Permissions table
    await queryInterface.createTable('Permissions', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create RolePermissions table
    await queryInterface.createTable('RolePermissions', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      role: {
        type: DataTypes.ENUM('admin', 'manager', 'cashier'),
        allowNull: false
      },
      permissionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Permissions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Insert default permissions
    const permissions = [
      { name: 'manage_users', description: 'Can manage system users' },
      { name: 'manage_employees', description: 'Can manage employees' },
      { name: 'manage_products', description: 'Can manage products' },
      { name: 'manage_categories', description: 'Can manage categories' },
      { name: 'manage_sales', description: 'Can manage sales' },
      { name: 'create_sales', description: 'Can create new sales' },
      { name: 'view_reports', description: 'Can view reports' },
      { name: 'manage_expenses', description: 'Can manage expenses' },
      { name: 'view_dashboard', description: 'Can view dashboard' },
      { name: 'access_pos', description: 'Can access POS system' },
      { name: 'view_customers', description: 'Can view customers' },
      { name: 'manage_customers', description: 'Can manage customers' }
    ];

    await queryInterface.bulkInsert('Permissions', permissions.map(p => ({
      ...p,
      createdAt: new Date(),
      updatedAt: new Date()
    })));

    // Get all inserted permissions
    const insertedPermissions = await queryInterface.sequelize.query(
      'SELECT id, name FROM Permissions',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    // Create permission mappings
    const rolePermissions = [];
    
    // Admin gets all permissions
    insertedPermissions.forEach(permission => {
      rolePermissions.push({
        role: 'admin',
        permissionId: permission.id,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });

    // Manager permissions
    const managerPermissions = [
      'manage_employees', 'manage_products', 'manage_categories',
      'manage_sales', 'create_sales', 'view_reports', 'manage_expenses',
      'view_dashboard', 'access_pos', 'view_customers', 'manage_customers'
    ];
    insertedPermissions
      .filter(p => managerPermissions.includes(p.name))
      .forEach(permission => {
        rolePermissions.push({
          role: 'manager',
          permissionId: permission.id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      });

    // Cashier permissions
    const cashierPermissions = ['create_sales', 'access_pos'];
    insertedPermissions
      .filter(p => cashierPermissions.includes(p.name))
      .forEach(permission => {
        rolePermissions.push({
          role: 'cashier',
          permissionId: permission.id,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      });

    await queryInterface.bulkInsert('RolePermissions', rolePermissions);
  },

  down: async (queryInterface, Sequelize) => {
    // Disable foreign key checks
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // Drop all tables
    await queryInterface.dropTable('RolePermissions');
    await queryInterface.dropTable('Permissions');
    await queryInterface.dropTable('Employees');
    await queryInterface.dropTable('Users');
    
    // Enable foreign key checks
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};