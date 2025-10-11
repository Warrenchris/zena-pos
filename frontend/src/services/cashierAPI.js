import api from './api';

// Cashier-specific API endpoints
export const cashierAPI = {
  // Get cashier statistics with date range
  getCashierStats: (employeeId, startDate, endDate) => 
    api.get('/api/sales/cashier-stats', {
      params: { employeeId, startDate, endDate }
    }),

  // Get cashier's own sales history
  getMySales: (page = 1, limit = 10) =>
    api.get('/api/sales/my-sales', {
      params: { 
        page,
        limit,
        sortBy: 'createdAt',
        sortOrder: 'DESC'
      }
    }),

  // Get all sales for the cashier (paginated)
  getAllMySales: async (params) => {
    const response = await api.get('/api/sales/my-sales', { params });
    return response.data;
  },

  // Get cashier's top selling products
  getTopSellingProducts: (period = 'today') =>
    api.get('/api/sales/top-products', {
      params: { period }
    }),

  // Create a new sale
  createSale: (saleData) =>
    api.post('/api/sales', saleData),
    
  // Get available products (read-only)
  getProducts: async (params) => {
    const response = await api.get('/api/products', { params });
    return response.data;
  },

  // Get cashier's daily performance
  getDailyPerformance: (employeeId, date) =>
    api.get('/api/sales/daily-performance', {
      params: { employeeId, date }
    }),

  // Get cashier's weekly performance
  getWeeklyPerformance: (employeeId, weekStart) =>
    api.get('/api/sales/weekly-performance', {
      params: { employeeId, weekStart }
    }),

  // Get cashier's monthly performance
  getMonthlyPerformance: (employeeId, month, year) =>
    api.get('/api/sales/monthly-performance', {
      params: { employeeId, month, year }
    }),

  // Hold cart functionality
  holdCart: (cartData) =>
    api.post('/api/sales/hold-cart', cartData),

  // Retrieve held cart
  getHeldCarts: (employeeId) =>
    api.get('/api/sales/held-carts', {
      params: { employeeId }
    }),

  // Delete held cart
  deleteHeldCart: (cartId) =>
    api.delete(`/api/sales/held-carts/${cartId}`),

  // Process refund
  processRefund: (saleId, refundData) =>
    api.post(`/api/sales/${saleId}/refund`, refundData),

  // Get refund history
  getRefundHistory: (employeeId, limit = 10) =>
    api.get('/api/sales/refunds', {
      params: { employeeId, limit }
    })
};

export default cashierAPI;
