import api from './api';

const analyticsService = {
  async getVisitorStats(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/visitors?period=${period}`);
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

  async getOrderStats(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/orders?period=${period}`);
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

  async getTopProducts(period = 'week', limit = 5) {
    try {
      const response = await api.get(`/api/analytics/top-products?period=${period}&limit=${limit}`);
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

  async getSalesChannels(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/sales-channels?period=${period}`);
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

  async getCustomerLocations(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/customer-locations?period=${period}`);
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