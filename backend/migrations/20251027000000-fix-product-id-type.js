'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Drop existing foreign key if it exists
      const [results] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE TABLE_NAME = 'SaleItems' 
        AND COLUMN_NAME = 'productId' 
        AND REFERENCED_TABLE_NAME = 'Products';
      `);
      
      if (results.length > 0) {
        const constraintName = results[0].CONSTRAINT_NAME;
        await queryInterface.sequelize.query(`
          ALTER TABLE SaleItems 
          DROP FOREIGN KEY \`${constraintName}\`;
        `);
      }

      // Change the column type to int for consistency
      await queryInterface.changeColumn('SaleItems', 'productId', {
        type: Sequelize.INTEGER,
        allowNull: true
      });

      // Add back the foreign key constraint
      await queryInterface.addConstraint('SaleItems', {
        fields: ['productId'],
        type: 'foreign key',
        name: 'FK_SaleItems_Products',
        references: {
          table: 'Products',
          field: 'id'
        }
      });
    } catch (error) {
      // Migration may have already run or tables don't exist
      console.log('Migration error (may be expected if already run):', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // Drop the foreign key constraint
      const [results] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME 
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE TABLE_NAME = 'SaleItems' 
        AND COLUMN_NAME = 'productId' 
        AND REFERENCED_TABLE_NAME = 'Products';
      `);
      
      if (results.length > 0) {
        const constraintName = results[0].CONSTRAINT_NAME;
        await queryInterface.removeConstraint('SaleItems', constraintName);
      }
    } catch (error) {
      console.log('Down migration error (may be expected):', error.message);
    }
  }
};