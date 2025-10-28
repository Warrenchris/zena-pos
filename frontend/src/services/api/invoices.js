import { api } from '../../utils/api';

export const invoicesAPI = {
  // Get all invoices with optional filters
  getAll: (params) => api.get('/api/invoices', { params }),
  
  // Get a specific invoice by ID
  getById: (id) => api.get(`/api/invoices/${id}`),
  
  // Create a new invoice
  create: (data) => api.post('/api/invoices', data),
  
  // Update an invoice
  update: (id, data) => api.put(`/api/invoices/${id}`, data),
  
  // Delete an invoice
  delete: (id) => api.delete(`/api/invoices/${id}`),
  
  // Get invoice statistics
  getStatistics: (params) => api.get('/api/invoices/statistics', { params }),
  
  // Generate PDF for an invoice
  generatePDF: (id) => api.get(`/api/invoices/${id}/pdf`, { responseType: 'blob' }),
  
  // Email invoice to customer
  sendByEmail: (id, emailData) => api.post(`/api/invoices/${id}/send`, emailData),
};