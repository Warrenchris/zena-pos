'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First check if users table exists, if not create it
    const [results] = await queryInterface.sequelize.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME = 'Users'"
    );
    
    if (results.length === 0) {
      await queryInterface.createTable('Users', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        email: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        }
      });
    }

    // Now safely proceed with the invoice changes
    try {
      // Check if userId column exists
      const columns = await queryInterface.describeTable('invoices');
      if (!columns.userId) {
        // Add userId column
        await queryInterface.addColumn('invoices', 'userId', {
          type: Sequelize.INTEGER,
          allowNull: true, // temporarily allow null
          references: {
            model: 'Users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        });
      }

      // Skip data migration as this is a new column

      // Make userId not null
      await queryInterface.changeColumn('invoices', 'userId', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });

      // Check if issuerId column exists before dropping it
      const columnInfo = await queryInterface.describeTable('invoices');
      if (columnInfo.issuerId) {
        await queryInterface.removeColumn('invoices', 'issuerId');
      }
    } catch (error) {
      console.error('Migration error:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Add back issuerId
      await queryInterface.addColumn('invoices', 'issuerId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });

      // Copy data back
      await queryInterface.sequelize.query(`
        UPDATE invoices SET issuerId = userId WHERE issuerId IS NULL
      `);

      // Make issuerId not null
      await queryInterface.changeColumn('invoices', 'issuerId', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      });

      // Remove userId
      await queryInterface.removeColumn('invoices', 'userId');
    } catch (error) {
      console.error('Migration rollback error:', error);
      throw error;
    }
  }
};