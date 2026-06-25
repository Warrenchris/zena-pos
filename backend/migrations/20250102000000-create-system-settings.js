'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      await queryInterface.createTable('SystemSettings', {
        id: {
          allowNull: false,
          autoIncrement: true,
          primaryKey: true,
          type: Sequelize.INTEGER
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
        // General Settings
        systemName: {
          type: Sequelize.STRING,
          defaultValue: 'Zana POS System'
        },
        businessLogo: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        contactEmail: {
          type: Sequelize.STRING,
          allowNull: true
        },
        contactPhone: {
          type: Sequelize.STRING,
          allowNull: true
        },
        timezone: {
          type: Sequelize.STRING,
          defaultValue: 'Africa/Nairobi'
        },
        language: {
          type: Sequelize.STRING,
          defaultValue: 'en'
        },
        theme: {
          type: Sequelize.ENUM('light', 'dark', 'system'),
          defaultValue: 'dark'
        },
        // Currency Settings
        defaultCurrency: {
          type: Sequelize.STRING,
          defaultValue: 'KES'
        },
        currencySymbol: {
          type: Sequelize.STRING,
          defaultValue: 'KSh'
        },
        currencyPosition: {
          type: Sequelize.ENUM('before', 'after'),
          defaultValue: 'before'
        },
        decimalPlaces: {
          type: Sequelize.INTEGER,
          defaultValue: 2
        },
        // Notification Settings
        enableNotifications: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        enableSoundAlerts: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        enableEmailAlerts: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        enableSuccessToasts: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        enableErrorToasts: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        // Security Settings
        passwordMinLength: {
          type: Sequelize.INTEGER,
          defaultValue: 8
        },
        requireSpecialChars: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        sessionTimeout: {
          type: Sequelize.INTEGER,
          defaultValue: 480
        },
        enableTwoFactor: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        maxLoginAttempts: {
          type: Sequelize.INTEGER,
          defaultValue: 5
        },
        // Data & Backup Settings
        autoBackupEnabled: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        backupFrequency: {
          type: Sequelize.ENUM('daily', 'weekly', 'monthly'),
          defaultValue: 'daily'
        },
        backupRetentionDays: {
          type: Sequelize.INTEGER,
          defaultValue: 30
        },
        // User Management Settings
        allowUserRegistration: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        requireEmailVerification: {
          type: Sequelize.BOOLEAN,
          defaultValue: true
        },
        // Additional Settings (JSON for extensibility)
        additionalSettings: {
          type: Sequelize.JSON,
          defaultValue: {}
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
    } catch (err) {
      if (!err.message || !err.message.includes('already exists')) throw err;
      console.log('Table SystemSettings already exists, skipping');
    }

    // Add unique constraint for shopId
    try {
      await queryInterface.addIndex('SystemSettings', ['shopId'], {
        unique: true,
        name: 'unique_shop_settings'
      });
    } catch (err) {
      console.log('Index unique_shop_settings already exists, skipping');
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('SystemSettings');
  }
};
