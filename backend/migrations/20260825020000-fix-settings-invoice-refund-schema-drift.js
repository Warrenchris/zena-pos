'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // --- SystemSettings: refund/return policy fields ---
    try {
      const settingsDesc = await queryInterface.describeTable('SystemSettings');

      if (!settingsDesc.maxUnapprovedRefundAmount) {
        await queryInterface.addColumn('SystemSettings', 'maxUnapprovedRefundAmount', {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 5000.00
        });
        console.log('Added column maxUnapprovedRefundAmount to SystemSettings');
      } else {
        console.log('Column maxUnapprovedRefundAmount already exists in SystemSettings, skipping');
      }

      if (!settingsDesc.returnWindowDays) {
        await queryInterface.addColumn('SystemSettings', 'returnWindowDays', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 30
        });
        console.log('Added column returnWindowDays to SystemSettings');
      } else {
        console.log('Column returnWindowDays already exists in SystemSettings, skipping');
      }
    } catch (err) {
      console.error('Failed executing SystemSettings portion of migration:', err);
      throw err;
    }

    // --- Invoices: link to originating Sale + payment date ---
    try {
      const invoiceDesc = await queryInterface.describeTable('Invoices');

      if (!invoiceDesc.saleId) {
        await queryInterface.addColumn('Invoices', 'saleId', {
          type: Sequelize.INTEGER,
          allowNull: true
        });
        console.log('Added column saleId to Invoices');
      } else {
        console.log('Column saleId already exists in Invoices, skipping');
      }

      if (!invoiceDesc.paymentDate) {
        await queryInterface.addColumn('Invoices', 'paymentDate', {
          type: Sequelize.DATE,
          allowNull: true
        });
        console.log('Added column paymentDate to Invoices');
      } else {
        console.log('Column paymentDate already exists in Invoices, skipping');
      }
    } catch (err) {
      console.error('Failed executing Invoices portion of migration:', err);
      throw err;
    }

    // --- SaleRefunds: reason/disposition/manager-approval fields ---
    try {
      const refundDesc = await queryInterface.describeTable('SaleRefunds');

      if (!refundDesc.reasonCode) {
        await queryInterface.addColumn('SaleRefunds', 'reasonCode', {
          type: Sequelize.ENUM('DEFECTIVE', 'WRONG_ITEM', 'EXPIRED', 'CHANGED_MIND', 'OTHER'),
          allowNull: false,
          defaultValue: 'OTHER'
        });
        console.log('Added column reasonCode to SaleRefunds');
      } else {
        console.log('Column reasonCode already exists in SaleRefunds, skipping');
      }

      if (!refundDesc.reasonNotes) {
        await queryInterface.addColumn('SaleRefunds', 'reasonNotes', {
          type: Sequelize.TEXT,
          allowNull: true
        });
        console.log('Added column reasonNotes to SaleRefunds');
      } else {
        console.log('Column reasonNotes already exists in SaleRefunds, skipping');
      }

      if (!refundDesc.disposition) {
        await queryInterface.addColumn('SaleRefunds', 'disposition', {
          type: Sequelize.ENUM('restock', 'damaged_writeoff', 'return_to_supplier'),
          allowNull: false,
          defaultValue: 'restock'
        });
        console.log('Added column disposition to SaleRefunds');
      } else {
        console.log('Column disposition already exists in SaleRefunds, skipping');
      }

      if (!refundDesc.managerApprovalId) {
        await queryInterface.addColumn('SaleRefunds', 'managerApprovalId', {
          type: Sequelize.STRING(36),
          allowNull: true
        });
        console.log('Added column managerApprovalId to SaleRefunds');
      } else {
        console.log('Column managerApprovalId already exists in SaleRefunds, skipping');
      }
    } catch (err) {
      console.error('Failed executing SaleRefunds portion of migration:', err);
      throw err;
    }
  },

  async down(queryInterface) {
    try {
      const settingsDesc = await queryInterface.describeTable('SystemSettings');
      if (settingsDesc.maxUnapprovedRefundAmount) await queryInterface.removeColumn('SystemSettings', 'maxUnapprovedRefundAmount');
      if (settingsDesc.returnWindowDays) await queryInterface.removeColumn('SystemSettings', 'returnWindowDays');
    } catch (err) {
      console.error('Failed reverting SystemSettings portion:', err);
    }

    try {
      const invoiceDesc = await queryInterface.describeTable('Invoices');
      if (invoiceDesc.saleId) await queryInterface.removeColumn('Invoices', 'saleId');
      if (invoiceDesc.paymentDate) await queryInterface.removeColumn('Invoices', 'paymentDate');
    } catch (err) {
      console.error('Failed reverting Invoices portion:', err);
    }

    try {
      const refundDesc = await queryInterface.describeTable('SaleRefunds');
      if (refundDesc.reasonCode) await queryInterface.removeColumn('SaleRefunds', 'reasonCode');
      if (refundDesc.reasonNotes) await queryInterface.removeColumn('SaleRefunds', 'reasonNotes');
      if (refundDesc.disposition) await queryInterface.removeColumn('SaleRefunds', 'disposition');
      if (refundDesc.managerApprovalId) await queryInterface.removeColumn('SaleRefunds', 'managerApprovalId');
    } catch (err) {
      console.error('Failed reverting SaleRefunds portion:', err);
    }
  }
};
