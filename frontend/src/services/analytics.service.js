import api from './api';

const normalizeParams = (params) => {
  if (typeof params === 'string') return { period: params };
  return params || {};
};

const analyticsService = {
  async getVisitorStats(params = {}) {
    try {
      const response = await api.get('/api/analytics/visitors', { params: normalizeParams(params) });
      return response.data;
    } catch (error) {
      console.error('Error fetching visitor statistics:', error);
      // Return empty data structure on error
      return {
        visitorData: [],
        totalVisitors: 0,
        percentageChange: 0
      };
    }
  },

  async getOrderStats(params = {}) {
    try {
      const response = await api.get('/api/analytics/orders', { params: normalizeParams(params) });
      return response.data;
    } catch (error) {
      console.error('Error fetching order statistics:', error);
      // Return empty data structure on error
      return {
        orderData: [],
        revenueData: [],
        totalOrders: 0,
        totalRevenue: 0,
        orderPercentageChange: 0,
        revenuePercentageChange: 0
      };
    }
  },

  async getTopProducts(params = {}, limit = 5) {
    try {
      const p = typeof params === 'string' ? { period: params, limit } : { limit, ...params };
      const response = await api.get('/api/analytics/top-products', { params: p });
      return response.data;
    } catch (error) {
      console.error('Error fetching top products:', error);
      // Return empty data structure on error
      return {
        products: [],
        totalSales: 0,
        salesPercentageChange: 0
      };
    }
  },

  async getSalesChannels(params = {}) {
    try {
      const response = await api.get('/api/analytics/sales-channels', { params: normalizeParams(params) });
      return response.data;
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      // Return empty data structure on error
      return {
        platforms: [],
        totalSales: 0,
        totalRevenue: 0,
        salesPercentageChange: 0
      };
    }
  },

  async getCustomerLocations(params = {}) {
    try {
      const response = await api.get('/api/analytics/customer-locations', { params: normalizeParams(params) });
      return response.data;
    } catch (error) {
      console.error('Error fetching customer locations:', error);
      // Return empty data structure on error
      return {
        locations: [],
        totalCustomers: 0,
        percentageChange: 0
      };
    }
  }
};

export default analyticsService;