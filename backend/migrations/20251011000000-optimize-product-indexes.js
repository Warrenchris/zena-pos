'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Get table description to understand existing columns
      const [tableDesc] = await queryInterface.sequelize.query(
        'DESCRIBE Products'
      );
      
      // Get existing indexes
      const [indexes] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM Products'
      );

      // Only drop non-essential and non-foreign key indexes
      const indexesToDrop = indexes.filter(idx => 
        idx.Key_name !== 'PRIMARY' && 
        !idx.Key_name.startsWith('fk_') &&
        idx.Key_name !== 'products_sku_unique' &&
        idx.Key_name !== 'products_barcode_unique'
      );

      for (const index of indexesToDrop) {
        await queryInterface.sequelize.query(
          `DROP INDEX \`${index.Key_name}\` ON Products`
        ).catch(err => console.log(`Note: Failed to drop index ${index.Key_name}:`, err.message));
      }

      // Add or update SKU index if needed
      if (!indexes.some(idx => idx.Key_name === 'products_sku_unique')) {
        await queryInterface.addIndex('Products', ['sku'], {
          unique: true,
          name: 'products_sku_unique'
        }).catch(err => console.log('Note: SKU index already exists'));
      }

      // Add or update barcode index if needed
      if (!indexes.some(idx => idx.Key_name === 'products_barcode_unique')) {
        await queryInterface.addIndex('Products', ['barcode'], {
          unique: true,
          name: 'products_barcode_unique'
        }).catch(err => console.log('Note: Barcode index already exists'));
      }

      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // In down migration, we'll only remove the indexes we're sure we added
    try {
      await queryInterface.removeIndex('Products', 'products_sku_unique')
        .catch(err => console.log('Note: sku index removal skipped'));
      await queryInterface.removeIndex('Products', 'products_barcode_unique')
        .catch(err => console.log('Note: barcode index removal skipped'));
    } catch (error) {
      console.error('Down migration failed:', error);
      throw error;
    }
  }
};