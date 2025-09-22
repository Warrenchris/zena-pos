'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Units', {
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
      abbreviation: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      conversionRate: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 1.0000
      },
      shopId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Shops',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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

    // Add composite unique constraint for name and shopId
    await queryInterface.addConstraint('Units', {
      fields: ['name', 'shopId'],
      type: 'unique',
      name: 'unique_unit_name_per_shop'
    });

    // Add index for shopId
    await queryInterface.addIndex('Units', ['shopId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Units');
  }
};