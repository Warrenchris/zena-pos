import api from './api';

export const platformAPI = {
  getOverview: () => api.get('/api/platform/overview'),
  getOrganizations: (params) => api.get('/api/platform/organizations', { params }),
  getOrganization: (id) => api.get(`/api/platform/organizations/${id}`),
  getPlans: () => api.get('/api/platform/plans'),
  getInvoices: (params) => api.get('/api/platform/invoices', { params }),
  getNotifications: (params) => api.get('/api/platform/notifications', { params })
};

export default platformAPI;
