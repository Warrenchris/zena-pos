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

function withSaleFilter(baseWhere = {}, saleFilter = NON_CANCELLED_SALE_FILTER) {
  const existingAnd = Array.isArray(baseWhere[Op.and])
    ? baseWhere[Op.and]
    : (baseWhere[Op.and] ? [baseWhere[Op.and]] : []);
  const filterAnd = Array.isArray(saleFilter[Op.and])
    ? saleFilter[Op.and]
    : [saleFilter];
  return {
    ...baseWhere,
    [Op.and]: [...existingAnd, ...filterAnd]
  };
}

function formatAliasPrefix(tableAlias = '') {
  if (!tableAlias) return '';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableAlias)) {
    throw new Error(`Invalid SQL table alias: ${tableAlias}`);
  }
  return `${tableAlias}.`;
}

function buildNonCancelledSaleSqlCondition(tableAlias = '') {
  const p = formatAliasPrefix(tableAlias);
  return `((${p}saleStatus NOT IN ('cancelled', 'pending', 'confirmed', 'processing') OR ${p}saleStatus IS NULL) AND (${p}status NOT IN ('cancelled', 'pending') OR ${p}status IS NULL) AND (${p}fulfillmentStatus != 'failed' OR ${p}fulfillmentStatus IS NULL))`;
}

function buildRealizedSaleSqlCondition(tableAlias = '') {
  const p = formatAliasPrefix(tableAlias);
  return `((${p}saleStatus IN ('completed', 'partially_refunded', 'partial_refund') OR ${p}saleStatus IS NULL) AND (${p}status = 'completed' OR ${p}status IS NULL) AND (${p}fulfillmentStatus != 'failed' OR ${p}fulfillmentStatus IS NULL))`;
}

function isSaleCancelledOrUnrealized(sale) {
  if (!sale) return false;
  if (['cancelled', 'pending', 'confirmed', 'processing'].includes(sale.saleStatus)) return true;
  if (['cancelled', 'pending'].includes(sale.status)) return true;
  if (sale.fulfillmentStatus === 'failed') return true;
  if (sale.metadata?.isDeleted === true) return true;
  return false;
}

module.exports = {
  NON_CANCELLED_SALE_FILTER,
  REALIZED_SALE_FILTER,
  NET_SALE_REVENUE_SQL,
  withSaleFilter,
  buildNonCancelledSaleSqlCondition,
  buildRealizedSaleSqlCondition,
  isSaleCancelledOrUnrealized
};
