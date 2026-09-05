'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.changeColumn('Sales', 'paymentMethod', {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'cash'
      });
    } catch (e) {
      console.log('paymentMethod column change error (non-fatal):', e.message);
    }
  },

  down: async (queryInterface, Sequelize) => {}
};
