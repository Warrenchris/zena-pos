// Dashboard API
export const dashboardAPI = {
  getStats: (params) =>
    api.get('/api/dashboard/stats', { params }),
  getRevenueChart: (params) =>
    api.get('/api/dashboard/revenue', { params }),
  getVisitorStats: (params) =>
    api.get('/api/dashboard/visitors', { params }),
  getOrderStats: (params) =>
    api.get('/api/dashboard/orders', { params }),
  getPlatformStats: () =>
    api.get('/api/dashboard/platform'),
  getLocationStats: () =>
    api.get('/api/dashboard/locations'),
  getTopProducts: (params) =>
    api.get('/api/dashboard/top-products', { params }),
};