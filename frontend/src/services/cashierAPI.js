import api from './api';

// Cashier-specific API endpoints
export const cashierAPI = {
  // Get cashier statistics
  getCashierStats: (employeeId, startDate, endDate) => 
    api.get('/api/sales/cashier-stats', {
      params: { employeeId, startDate, endDate }
    }),

  // Get cashier's recent sales
  getRecentSales: (employeeId, limit = 10) =>
    api.get('/api/sales', {
      params: { 
        employeeId, 
        limit,
        sortBy: 'createdAt',
        sortOrder: 'DESC'
      }
    }),

  // Get cashier's top selling products
  getTopSellingProducts: (employeeId, period = 'today') =>
    api.get('/api/sales/top-products', {
      params: { employeeId, period }
    }),

  // Create a new sale
  createSale: (saleData) =>
    api.post('/api/sales', saleData),

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
