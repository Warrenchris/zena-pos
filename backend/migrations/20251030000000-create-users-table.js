'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First check if table exists
    const tableInfo = await queryInterface.describeTable('Users').catch(() => null);
    if (!tableInfo) {
      await queryInterface.createTable('Users', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        email: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true
        },
        password: {
          type: Sequelize.STRING,
          allowNull: false
        },
        role: {
          type: Sequelize.STRING,
          defaultValue: 'user'
        },
        active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        shopId: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'Shops',
            key: 'id'
          }
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false
        }
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Users');
  }
};