'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // First, check if both columns exist
      const tableInfo = await queryInterface.describeTable('Sales');
      // If both exist, we need to merge the data and remove the capitalized one
      if (tableInfo.UserId && tableInfo.userId) {
        // First, copy any data from UserId to userId where userId is null
        await queryInterface.sequelize.query(`
          UPDATE Sales 
          SET userId = UserId 
          WHERE userId IS NULL AND UserId IS NOT NULL
        `);
        
        // Then remove the capitalized column
        await queryInterface.removeColumn('Sales', 'UserId');
      } else if (tableInfo.UserId) {
        // If only UserId exists, rename it to userId
        await queryInterface.renameColumn('Sales', 'UserId', 'userId');
      } else if (!tableInfo.userId) {
        // If neither exists, add the lowercase version
        await queryInterface.addColumn('Sales', 'userId', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'Users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        });
      }

    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      // In case we need to rollback, we'll add back the UserId column
      await queryInterface.addColumn('Sales', 'UserId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    } catch (error) {
      console.error('Migration rollback failed:', error);
      throw error;
    }
  }
};