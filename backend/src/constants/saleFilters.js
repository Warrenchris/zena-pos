const { Op } = require('sequelize');

const NON_CANCELLED_SALE_FILTER = {
  saleStatus: { [Op.ne]: 'cancelled' }
};

module.exports = {
  NON_CANCELLED_SALE_FILTER
};
