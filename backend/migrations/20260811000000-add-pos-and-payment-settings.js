'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      const tableDescription = await queryInterface.describeTable('SystemSettings');

      const newColumns = {
        taxRate: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.00,
          allowNull: false
        },
        receiptHeader: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        receiptFooter: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        showLogoOnReceipt: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
          allowNull: false
        },
        printerType: {
          type: Sequelize.ENUM('browser', 'thermal'),
          defaultValue: 'browser',
          allowNull: false
        },
        printerIP: {
          type: Sequelize.STRING,
          allowNull: true
        },
        paybillNumber: {
          type: Sequelize.STRING,
          allowNull: true
        },
        tillNumber: {
          type: Sequelize.STRING,
          allowNull: true
        },
        consumerKey: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        consumerSecret: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        passkey: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        enabledPaymentMethods: {
          type: Sequelize.JSON,
          allowNull: true
        }
      };

      for (const [colName, colSpec] of Object.entries(newColumns)) {
        if (!tableDescription[colName]) {
          await queryInterface.addColumn('SystemSettings', colName, colSpec);
          console.log(`Added column ${colName} to SystemSettings`);
        } else {
          console.log(`Column ${colName} already exists in SystemSettings, skipping`);
        }
      }
    } catch (err) {
      console.error('Failed executing migration 20260811000000-add-pos-and-payment-settings:', err);
      throw err;
    }
  },

  async down(queryInterface) {
    try {
      const tableDescription = await queryInterface.describeTable('SystemSettings');
      const columnsToRemove = [
        'taxRate',
        'receiptHeader',
        'receiptFooter',
        'showLogoOnReceipt',
        'printerType',
        'printerIP',
        'paybillNumber',
        'tillNumber',
        'consumerKey',
        'consumerSecret',
        'passkey',
        'enabledPaymentMethods'
      ];

      for (const colName of columnsToRemove) {
        if (tableDescription[colName]) {
          await queryInterface.removeColumn('SystemSettings', colName);
          console.log(`Removed column ${colName} from SystemSettings`);
        }
      }
    } catch (err) {
      console.error('Failed reverting migration 20260811000000-add-pos-and-payment-settings:', err);
    }
  }
};
