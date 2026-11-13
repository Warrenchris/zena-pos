const { Op } = require('sequelize');

function operatingExpenseCategoryFilter(requestedCategory) {
  if (requestedCategory !== undefined && requestedCategory !== null && requestedCategory !== '') {
    return { category: requestedCategory };
  }
  return { category: { [Op.ne]: 'inventory' } };
}

module.exports = { operatingExpenseCategoryFilter };
