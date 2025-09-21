const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // This migration updates existing permissions and role mappings
    // The tables were already created in the initial schema migration
    
    console.log('Updating permissions and role mappings...');
    
    // Check if we need to add any missing permissions
    const existingPermissions = await queryInterface.sequelize.query(
      'SELECT name FROM Permissions',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    
    const existingPermissionNames = existingPermissions.map(p => p.name);
    const allPermissions = [
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
    
    // Add missing permissions
    const missingPermissions = allPermissions.filter(p => !existingPermissionNames.includes(p.name));
    if (missingPermissions.length > 0) {
      await queryInterface.bulkInsert('Permissions', missingPermissions.map(p => ({
        ...p,
        createdAt: new Date(),
        updatedAt: new Date()
      })));
      console.log(`Added ${missingPermissions.length} missing permissions`);
    }
    
    // Get all current permissions
    const allCurrentPermissions = await queryInterface.sequelize.query(
      'SELECT id, name FROM Permissions ORDER BY id ASC',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    
    // Clear existing role permissions and recreate them
    await queryInterface.sequelize.query('DELETE FROM RolePermissions');
    
    // Create permission mappings
    const rolePermissions = [];
    
    // Admin gets all permissions
    allCurrentPermissions.forEach(permission => {
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
    allCurrentPermissions
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
    allCurrentPermissions
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
    console.log(`Created ${rolePermissions.length} role permission mappings`);
  },

  down: async (queryInterface, Sequelize) => {
    // Clear role permissions
    await queryInterface.sequelize.query('DELETE FROM RolePermissions');
    
    // Optionally remove any permissions that were added in this migration
    // (This is optional since permissions might be used elsewhere)
    console.log('Rolled back role permission mappings');
  }
};