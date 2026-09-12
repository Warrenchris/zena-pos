const { Op, Sequelize } = require('sequelize');
const { Sale, Customer, ActivityLog, SaleItem, Product } = require('../models');
const sequelize = require('../config/database');
const { getCachedAnalytics, setCachedAnalytics } = require('../utils/analyticsCache');
const { NON_CANCELLED_SALE_FILTER } = require('../constants/saleFilters');

// Offset in milliseconds for Africa/Nairobi (UTC+3)
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Return a Date object representing local-Nairobi midnight (00:00:00.000)
 * for the calendar day that contains `utcNow`, expressed in UTC.
 * e.g. if utcNow is 2026-09-12T15:03:00Z (= 18:03 local) the result is
 *      2026-09-12T21:00:00.000Z (= 2026-09-13 00:00:00 local) — i.e.
 *      we first find the local day, then express its midnight back in UTC.
 */
function nairobiMidnightUTC(utcNow, dayOffset = 0) {
  // Shift to local time to identify the calendar date
  const localMs = utcNow.getTime() + NAIROBI_OFFSET_MS;
  // Truncate to midnight in local time (ms since epoch at local midnight)
  const localMidnightMs = Math.floor(localMs / 86400000) * 86400000;
  // Apply optional day offset (in whole local days)
  const shiftedLocalMs = localMidnightMs + dayOffset * 86400000;
  // Convert back to UTC
  return new Date(shiftedLocalMs - NAIROBI_OFFSET_MS);
}

// Helper function to calculate start and end dates with previous period comparison
function resolveDateRange(period, startDateParam, endDateParam) {
  const now = new Date();
  let startDate;
  let endDate = new Date(now);
  let previousStartDate;
  let previousEndDate;

  if (period === 'today') {
    // Africa/Nairobi day boundary — anchor to local midnight expressed in UTC
    // so that the DB range covers 00:00–23:59:59.999 Nairobi time.
    startDate = nairobiMidnightUTC(now, 0);          // today 00:00:00 local → UTC
    endDate   = new Date(nairobiMidnightUTC(now, 1).getTime() - 1); // today 23:59:59.999 local

    previousStartDate = nairobiMidnightUTC(now, -1); // yesterday 00:00:00 local → UTC
    previousEndDate   = new Date(startDate.getTime() - 1); // yesterday 23:59:59.999 local
  } else if (period === 'custom' && (startDateParam || endDateParam)) {
    startDate = startDateParam ? new Date(startDateParam) : new Date(now);
    if (startDateParam) startDate.setHours(0, 0, 0, 0);

    endDate = endDateParam ? new Date(endDateParam) : new Date(startDate);
    if (endDateParam) endDate.setHours(23, 59, 59, 999);

    const duration = endDate.getTime() - startDate.getTime();
    previousStartDate = new Date(startDate.getTime() - duration - 1);
    previousEndDate = new Date(startDate.getTime() - 1);
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    previousStartDate.setHours(0, 0, 0, 0);
    previousEndDate = new Date(prevMonthLastDay);
    previousEndDate.setHours(23, 59, 59, 999);
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now.getFullYear(), 11, 31);
    endDate.setHours(23, 59, 59, 999);

    previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
    previousStartDate.setHours(0, 0, 0, 0);
    previousEndDate = new Date(now.getFullYear() - 1, 11, 31);
    previousEndDate.setHours(23, 59, 59, 999);
  } else if (period === 'week') {
    // Current calendar week (Monday to Sunday) - matches Reports "This Week"
    const day = now.getDay() || 7;
    startDate = new Date(now);
    startDate.setDate(now.getDate() - day + 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - 7);
    previousStartDate.setHours(0, 0, 0, 0);

    previousEndDate = new Date(startDate);
    previousEndDate.setMilliseconds(-1);
  } else {
    // Default fallback
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    previousStartDate = new Date(startDate.getTime() - (now.getTime() - startDate.getTime()));
    previousEndDate = startDate;
  }

  return { startDate, endDate, previousStartDate, previousEndDate };
}

function formatDateKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateBuckets(period, startDate, endDate) {
  const buckets = [];
  const now = new Date();

  if (period === 'today') {
    for (let h = 0; h < 24; h++) {
      buckets.push(`${String(h).padStart(2, '0')}:00`);
    }
  } else if (period === 'week') {
    const curr = new Date(startDate);
    const sunday = new Date(startDate);
    sunday.setDate(startDate.getDate() + 6);
    const capDate = sunday < now ? sunday : now;
    const capStr = formatDateKey(capDate);

    while (formatDateKey(curr) <= capStr && curr <= sunday) {
      buckets.push(formatDateKey(curr));
      curr.setDate(curr.getDate() + 1);
    }
  } else if (period === 'month') {
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const monthEnd = new Date(year, month + 1, 0);
    const capDate = monthEnd < now ? monthEnd : now;
    const capStr = formatDateKey(capDate);

    const curr = new Date(year, month, 1);
    while (formatDateKey(curr) <= capStr && curr <= monthEnd) {
      buckets.push(formatDateKey(curr));
      curr.setDate(curr.getDate() + 1);
    }
  } else if (period === 'year') {
    const year = startDate.getFullYear();
    const maxMonth = (now.getFullYear() === year) ? (now.getMonth() + 1) : (year < now.getFullYear() ? 12 : 1);
    for (let m = 1; m <= maxMonth; m++) {
      buckets.push(`${year}-${String(m).padStart(2, '0')}`);
    }
  } else {
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      buckets.push(formatDateKey(curr));
      curr.setDate(curr.getDate() + 1);
    }
  }
  return buckets;
}

// Helper function to calculate growth
function calculateGrowth(currentTotal, previousTotal) {
  return previousTotal === 0 
    ? (currentTotal > 0 ? 100 : 0) 
    : ((currentTotal - previousTotal) / previousTotal) * 100;
}

const analyticsController = {
  // Get visitor statistics - OPTIMIZED with combined query and caching
  async getVisitors(req, res) {
    try {
      const { period = 'week', employeeId, startDate: qStart, endDate: qEnd } = req.query;
      const shopId = req.user.shopId;

      const cacheParams = { period, employeeId, startDate: qStart, endDate: qEnd };
      // Check cache first
      const cached = getCachedAnalytics(shopId, 'visitors', cacheParams);
      if (cached) {
        return res.json(cached);
      }

      const { startDate, endDate, previousStartDate } = resolveDateRange(period, qStart, qEnd);

      const isUuid = employeeId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId) : false;
      const empCondition = employeeId ? (isUuid ? ' AND employeeId = ?' : ' AND userId = ?') : '';

      const replacements = [
        startDate, endDate,
        previousStartDate, startDate,
        shopId, previousStartDate, endDate
      ];
      if (employeeId) {
        replacements.push(isUuid ? employeeId : parseInt(employeeId, 10));
      }

      // Combined query for current and previous periods.
      // CONVERT_TZ shifts stored UTC timestamps to Africa/Nairobi (+03:00) before
      // DATE() / HOUR() so that each sale lands in the correct local-time bucket.
      const results = await sequelize.query(`
        SELECT 
          DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00')) as date,
          HOUR(CONVERT_TZ(createdAt, '+00:00', '+03:00')) as hour,
          COUNT(CASE WHEN createdAt >= ? AND createdAt <= ? THEN 1 END) as current_visitors,
          COUNT(CASE WHEN createdAt >= ? AND createdAt < ? THEN 1 END) as previous_visitors
        FROM Sales
        WHERE shopId = ? AND createdAt >= ? AND createdAt <= ? AND saleStatus != 'cancelled'${empCondition}
        GROUP BY DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00')), HOUR(CONVERT_TZ(createdAt, '+00:00', '+03:00'))
        ORDER BY DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00')) ASC, HOUR(CONVERT_TZ(createdAt, '+00:00', '+03:00')) ASC
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      const currentPeriod = results.reduce((sum, day) => sum + parseInt(day.current_visitors || 0), 0);
      const previousPeriod = results.reduce((sum, day) => sum + parseInt(day.previous_visitors || 0), 0);
      const percentageChange = calculateGrowth(currentPeriod, previousPeriod);

      const buckets = generateBuckets(period, startDate, endDate);
      const visitorMap = {};
      buckets.forEach(b => {
        visitorMap[b] = 0;
      });

      results.forEach(row => {
        let key = row.date;
        if (period === 'today') {
          key = `${String(row.hour !== undefined ? row.hour : 0).padStart(2, '0')}:00`;
        } else if (period === 'year' && row.date) {
          key = String(row.date).substring(0, 7);
        }
        const count = parseInt(row.current_visitors || 0);
        if (visitorMap[key] !== undefined) {
          visitorMap[key] += count;
        } else if (count > 0) {
          visitorMap[key] = count;
        }
      });

      const visitorData = Object.entries(visitorMap)
        .map(([date, visitors]) => ({
          date,
          visitors
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const response = {
        visitorData,
        percentageChange,
        totalVisitors: currentPeriod
      };

      // Cache the result
      setCachedAnalytics(shopId, 'visitors', cacheParams, response);
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching visitor statistics:', error);
      res.status(500).json({ 
        error: 'Failed to fetch visitor statistics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get order tracking statistics - OPTIMIZED with combined query and caching
  async getOrderTracking(req, res) {
    try {
      const { period = 'week', employeeId, startDate: qStart, endDate: qEnd } = req.query;
      const shopId = req.user.shopId;

      const cacheParams = { period, employeeId, startDate: qStart, endDate: qEnd };
      // Check cache first
      const cached = getCachedAnalytics(shopId, 'orderTracking', cacheParams);
      if (cached) {
        return res.json(cached);
      }

      const { startDate, endDate, previousStartDate } = resolveDateRange(period, qStart, qEnd);

      const isUuid = employeeId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId) : false;
      const empCondition = employeeId ? (isUuid ? ' AND s.employeeId = ?' : ' AND s.userId = ?') : '';

      const replacements = [
        startDate, endDate, startDate, endDate,
        previousStartDate, startDate, previousStartDate, startDate,
        shopId, previousStartDate, endDate
      ];
      if (employeeId) {
        replacements.push(isUuid ? employeeId : parseInt(employeeId, 10));
      }

      // Combined query for both current and previous periods.
      // CONVERT_TZ shifts stored UTC timestamps to Africa/Nairobi (+03:00) before
      // DATE() / HOUR() so that each sale lands in the correct local-time bucket.
      const results = await sequelize.query(`
        SELECT 
          DATE(CONVERT_TZ(s.createdAt, '+00:00', '+03:00')) as date,
          HOUR(CONVERT_TZ(s.createdAt, '+00:00', '+03:00')) as hour,
          COUNT(CASE WHEN s.createdAt >= ? AND s.createdAt <= ? THEN 1 END) as current_count,
          SUM(CASE WHEN s.createdAt >= ? AND s.createdAt <= ? THEN (s.total - COALESCE((SELECT SUM(sr.amount) FROM SaleRefunds sr WHERE sr.saleId = s.id AND sr.status = 'processed'), 0)) ELSE 0 END) as current_revenue,
          COUNT(CASE WHEN s.createdAt >= ? AND s.createdAt < ? THEN 1 END) as previous_count,
          SUM(CASE WHEN s.createdAt >= ? AND s.createdAt < ? THEN (s.total - COALESCE((SELECT SUM(sr.amount) FROM SaleRefunds sr WHERE sr.saleId = s.id AND sr.status = 'processed'), 0)) ELSE 0 END) as previous_revenue
        FROM Sales s
        WHERE s.shopId = ? AND s.createdAt >= ? AND s.createdAt <= ? AND s.saleStatus != 'cancelled'${empCondition}
        GROUP BY DATE(CONVERT_TZ(s.createdAt, '+00:00', '+03:00')), HOUR(CONVERT_TZ(s.createdAt, '+00:00', '+03:00'))
        ORDER BY DATE(CONVERT_TZ(s.createdAt, '+00:00', '+03:00')), HOUR(CONVERT_TZ(s.createdAt, '+00:00', '+03:00'))
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      const currentPeriodOrders = results.reduce((sum, row) => sum + parseInt(row.current_count || 0), 0);
      const currentPeriodRevenue = results.reduce((sum, row) => sum + parseFloat(row.current_revenue || 0), 0);
      const previousPeriodOrders = results.reduce((sum, row) => sum + parseInt(row.previous_count || 0), 0);
      const previousPeriodRevenue = results.reduce((sum, row) => sum + parseFloat(row.previous_revenue || 0), 0);

      const orderPercentageChange = calculateGrowth(currentPeriodOrders, previousPeriodOrders);
      const revenuePercentageChange = calculateGrowth(currentPeriodRevenue, previousPeriodRevenue);

      // Group into buckets for response
      const buckets = generateBuckets(period, startDate, endDate);
      const statsByDate = {};
      buckets.forEach(b => {
        statsByDate[b] = { orders: 0, revenue: 0 };
      });

      results.forEach(row => {
        let key = row.date;
        if (period === 'today') {
          key = `${String(row.hour !== undefined ? row.hour : 0).padStart(2, '0')}:00`;
        } else if (period === 'year' && row.date) {
          key = String(row.date).substring(0, 7);
        }
        const currentCount = parseInt(row.current_count || 0);
        const currentRev = parseFloat(row.current_revenue || 0);
        if (statsByDate[key] !== undefined) {
          statsByDate[key].orders += currentCount;
          statsByDate[key].revenue += currentRev;
        } else if (currentCount > 0 || currentRev > 0) {
          statsByDate[key] = { orders: currentCount, revenue: currentRev };
        }
      });

      const orderData = Object.entries(statsByDate)
        .map(([date, stats]) => ({ 
          date, 
          orders: stats.orders, 
          revenue: stats.revenue 
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const response = {
        orderData,
        orderPercentageChange,
        revenuePercentageChange,
        totalOrders: currentPeriodOrders,
        totalRevenue: currentPeriodRevenue
      };

      // Cache the result
      setCachedAnalytics(shopId, 'orderTracking', cacheParams, response);
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching order statistics:', error);
      res.status(500).json({ 
        error: 'Failed to fetch order statistics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get top selling products
  async getTopProducts(req, res) {
    try {
      const { period = 'week', limit = 5, employeeId, startDate: qStart, endDate: qEnd } = req.query;
      const shopId = req.user.shopId;
      const { startDate, endDate, previousStartDate } = resolveDateRange(period, qStart, qEnd);

      const isUuid = employeeId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId) : false;
      let employeeCondition = '';
      const replacements = { shopId, startDate, endDate, limit: parseInt(limit) };

      if (employeeId) {
        if (isUuid) {
          employeeCondition = ' AND s.employeeId = :employeeId';
          replacements.employeeId = employeeId;
        } else {
          employeeCondition = ' AND s.userId = :employeeId';
          replacements.employeeId = parseInt(employeeId, 10);
        }
      }

      // Use raw SQL query for top products
      const topProducts = await sequelize.query(`
        SELECT 
          p.id,
          p.name,
          p.price,
          p.sku,
          SUM(si.quantity) as quantity,
          SUM(si.quantity * COALESCE(NULLIF(si.price, 0), si.unitPrice, p.price)) as revenue
        FROM SaleItems si
        INNER JOIN Sales s ON si.saleId = s.id
        INNER JOIN Products p ON si.productId = p.id
        WHERE s.shopId = :shopId
          AND s.saleStatus != 'cancelled'
          AND s.createdAt BETWEEN :startDate AND :endDate
          AND p.shopId = :shopId
          ${employeeCondition}
        GROUP BY p.id, p.name, p.price, p.sku
        ORDER BY revenue DESC
        LIMIT :limit
      `, {
        replacements,
        type: sequelize.QueryTypes.SELECT
      });

      // Get current period total sales
      const currentPeriodSales = topProducts.reduce((sum, p) => 
        sum + parseInt(p.quantity || 0), 0
      );

      // Get previous period for comparison
      const [previousProducts] = await sequelize.query(`
        SELECT SUM(si.quantity) as totalQuantity
        FROM SaleItems si
        INNER JOIN Sales s ON si.saleId = s.id
        WHERE s.shopId = :shopId
          AND s.saleStatus != 'cancelled'
          AND s.createdAt BETWEEN :previousStartDate AND :startDate
          ${employeeCondition}
      `, {
        replacements: { ...replacements, previousStartDate, startDate },
        type: sequelize.QueryTypes.SELECT
      });

      const previousPeriodSales = parseInt(previousProducts?.totalQuantity || 0);
      const salesPercentageChange = calculateGrowth(currentPeriodSales, previousPeriodSales);

      // Format response data
      const formattedProducts = topProducts.map(item => ({
        id: item.id,
        name: item.name,
        price: parseFloat(item.price || 0),
        quantity: parseInt(item.quantity || 0),
        revenue: parseFloat(item.revenue || 0),
        imageUrl: null,
        sku: item.sku
      }));

      res.json({
        products: formattedProducts,
        salesPercentageChange,
        totalSales: currentPeriodSales
      });
    } catch (error) {
      console.error('Error fetching top products:', error);
      res.status(500).json({ 
        error: 'Failed to fetch top products',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get sales channels distribution
  async getSalesChannels(req, res) {
    try {
      const { period = 'week', employeeId, startDate: qStart, endDate: qEnd } = req.query;
      const shopId = req.user.shopId;
      const { startDate, endDate, previousStartDate } = resolveDateRange(period, qStart, qEnd);

      const isUuid = employeeId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId) : false;

      const saleWhere = {
        shopId,
        ...NON_CANCELLED_SALE_FILTER,
        createdAt: { [Op.between]: [startDate, endDate] }
      };
      const prevWhere = {
        shopId,
        ...NON_CANCELLED_SALE_FILTER,
        createdAt: { [Op.between]: [previousStartDate, startDate] }
      };

      if (employeeId) {
        if (isUuid) {
          saleWhere.employeeId = employeeId;
          prevWhere.employeeId = employeeId;
        } else {
          saleWhere.userId = parseInt(employeeId, 10);
          prevWhere.userId = parseInt(employeeId, 10);
        }
      }

      const channels = await Sale.findAll({
        where: saleWhere,
        attributes: [
          'paymentMethod',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
          [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue']
        ],
        group: ['paymentMethod'],
        raw: true
      });

      const totalSales = channels.reduce((sum, channel) => sum + parseInt(channel.totalSales), 0);
      const totalRevenue = channels.reduce((sum, channel) => sum + parseFloat(channel.totalRevenue || 0), 0);

      // Get previous period for comparison
      const previousChannels = await Sale.findAll({
        where: prevWhere,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        raw: true
      });

      const previousSales = previousChannels.reduce((sum, c) => sum + parseInt(c.count), 0);
      const salesPercentageChange = calculateGrowth(totalSales, previousSales);

      res.json({
        platforms: channels.map(c => ({
          name: c.paymentMethod || 'Cash',
          orders: parseInt(c.totalSales),
          revenue: parseFloat(c.totalRevenue || 0),
          percentage: totalSales > 0 ? (parseInt(c.totalSales) / totalSales) * 100 : 0
        })),
        totalSales,
        totalRevenue,
        salesPercentageChange
      });
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      res.status(500).json({ 
        error: 'Failed to fetch sales channels',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get customer locations statistics
  async getCustomerLocations(req, res) {
    try {
      const { period = 'week', employeeId, startDate: qStart, endDate: qEnd } = req.query;
      const shopId = req.user.shopId;
      const { startDate, endDate, previousStartDate } = resolveDateRange(period, qStart, qEnd);

      const isUuid = employeeId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId) : false;

      const customerWhere = {
        shopId,
        createdAt: { [Op.between]: [startDate, endDate] }
      };

      const prevCustomerWhere = {
        shopId,
        createdAt: { [Op.between]: [previousStartDate, startDate] }
      };

      // If employeeId is specified, restrict to customers linked to sales made by that employee
      if (employeeId) {
        const empFilter = isUuid ? { employeeId } : { userId: parseInt(employeeId, 10) };
        const matchingCustomerIds = await Sale.findAll({
          where: {
            shopId,
            ...NON_CANCELLED_SALE_FILTER,
            ...empFilter,
            customerId: { [Op.ne]: null }
          },
          attributes: [[sequelize.fn('DISTINCT', sequelize.col('customerId')), 'customerId']],
          raw: true
        });
        const cIds = matchingCustomerIds.map(s => s.customerId).filter(Boolean);
        customerWhere.id = { [Op.in]: cIds.length > 0 ? cIds : [-1] };
        prevCustomerWhere.id = { [Op.in]: cIds.length > 0 ? cIds : [-1] };
      }

      // Get customers grouped by location
      const customerLocations = await Customer.findAll({
        where: customerWhere,
        attributes: [
          'address',
          [sequelize.fn('COUNT', sequelize.col('id')), 'customerCount']
        ],
        group: ['address'],
        having: sequelize.literal('customerCount > 0'),
        raw: true
      });

      const totalCustomers = customerLocations.reduce((sum, loc) => 
        sum + parseInt(loc.customerCount || 0), 0
      );

      // Get previous period
      const previousCustomers = await Customer.count({
        where: prevCustomerWhere
      });

      const percentageChange = calculateGrowth(totalCustomers, previousCustomers);

      // Format location data
      const locationData = customerLocations
        .map(location => ({
          address: location.address || 'Unknown',
          customers: parseInt(location.customerCount),
          orders: 0,
          revenue: 0,
          percentage: totalCustomers > 0 ? (parseInt(location.customerCount) / totalCustomers) * 100 : 0
        }))
        .sort((a, b) => b.customers - a.customers);

      res.json({
        locations: locationData,
        totalCustomers,
        percentageChange
      });
    } catch (error) {
      console.error('Error fetching customer locations:', error);
      res.status(500).json({ 
        error: 'Failed to fetch customer locations',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  }
};

module.exports = analyticsController;
