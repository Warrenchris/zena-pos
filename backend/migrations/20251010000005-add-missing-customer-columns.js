'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Customers');

    const hasCol = (name) => Object.keys(tableInfo).some(k => k.toLowerCase() === name.toLowerCase());

    // 1. Add loyaltyPoints if not present
    if (!hasCol('loyaltyPoints')) {
      await queryInterface.addColumn('Customers', 'loyaltyPoints', {
        type: Sequelize.INTEGER,
        defaultValue: 0
      });
    }

    // 2. Add totalPurchases if not present
    if (!hasCol('totalPurchases')) {
      await queryInterface.addColumn('Customers', 'totalPurchases', {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0.00
      });
    }

    // 3. Add lastVisit if not present
    if (!hasCol('lastVisit')) {
      await queryInterface.addColumn('Customers', 'lastVisit', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    // 4. Add notes if not present
    if (!hasCol('notes')) {
      await queryInterface.addColumn('Customers', 'notes', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    // 5. Add active if not present
    if (!hasCol('active')) {
      await queryInterface.addColumn('Customers', 'active', {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      });
    }

    // 6. Change address column type to TEXT if it is currently VARCHAR(255)
    if (tableInfo.address && tableInfo.address.type.includes('VARCHAR')) {
      await queryInterface.changeColumn('Customers', 'address', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    // 7. Add unique constraint on email if not present
    try {
      const [indexes] = await queryInterface.sequelize.query(
        "SHOW INDEX FROM `Customers` WHERE Column_name = 'email' AND Non_unique = 0;"
      );
      if (indexes.length === 0) {
        await queryInterface.addIndex('Customers', ['email'], {
          unique: true,
          name: 'Customers_email_unique'
        });
      }
    } catch (err) {
      console.log('Skipping unique index creation on Customers.email:', err.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Down action is a no-op as this is a safety migration to reconcile schema drift
  }
};
