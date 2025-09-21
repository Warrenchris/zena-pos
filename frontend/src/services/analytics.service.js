import api from './api';

const analyticsService = {
  async getVisitorStats(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/visitors?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching visitor statistics:', error);
      throw error;
    }
  },

  async getOrderStats(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/orders?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching order statistics:', error);
      throw error;
    }
  },

  async getTopProducts(period = 'week', limit = 5) {
    try {
      const response = await api.get(`/api/analytics/top-products?period=${period}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching top products:', error);
      throw error;
    }
  },

  async getSalesChannels(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/sales-channels?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      throw error;
    }
  },

  async getCustomerLocations(period = 'week') {
    try {
      const response = await api.get(`/api/analytics/customer-locations?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching customer locations:', error);
      throw error;
    }
  }
};

export default analyticsService;