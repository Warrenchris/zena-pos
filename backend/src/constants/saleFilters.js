const { Op } = require('sequelize');

const NON_CANCELLED_SALE_FILTER = {
  [Op.and]: [
    {
      [Op.or]: [
        { saleStatus: { [Op.notIn]: ['cancelled', 'pending', 'confirmed', 'processing'] } },
        { saleStatus: null }
      ]
    },
    {
      [Op.or]: [
        { status: { [Op.notIn]: ['cancelled', 'pending'] } },
        { status: null }
      ]
    },
    {
      [Op.or]: [
        { fulfillmentStatus: { [Op.ne]: 'failed' } },
        { fulfillmentStatus: null }
      ]
    }
  ]
};

const REALIZED_SALE_FILTER = {
  [Op.and]: [
    {
      [Op.or]: [
        { saleStatus: { [Op.in]: ['completed', 'partially_refunded', 'partial_refund'] } },
        { saleStatus: null }
      ]
    },
    {
      [Op.or]: [
        { status: 'completed' },
        { status: null }
      ]
    },
    {
      [Op.or]: [
        { fulfillmentStatus: { [Op.ne]: 'failed' } },
        { fulfillmentStatus: null }
      ]
    }
  ]
};

const NET_SALE_REVENUE_SQL = `(
  CASE
    WHEN (\`Sale\`.\`total\` - COALESCE((
      SELECT SUM(\`sr\`.\`amount\`)
      FROM \`SaleRefunds\` AS \`sr\`
      WHERE \`sr\`.\`saleId\` = \`Sale\`.\`id\`
        AND \`sr\`.\`status\` = 'processed'
    ), 0)) > 0
    THEN (\`Sale\`.\`total\` - COALESCE((
      SELECT SUM(\`sr\`.\`amount\`)
      FROM \`SaleRefunds\` AS \`sr\`
      WHERE \`sr\`.\`saleId\` = \`Sale\`.\`id\`
        AND \`sr\`.\`status\` = 'processed'
    ), 0))
    ELSE 0
  END
)`;

module.exports = {
  NON_CANCELLED_SALE_FILTER,
  REALIZED_SALE_FILTER,
  NET_SALE_REVENUE_SQL
};
