import api from './axios';

export const invoiceService = {
  async getInvoices() {
    try {
      const response = await api.get('/api/invoices');
      return response.data;
    } catch (error) {
      console.error('Error fetching invoices:', error);
      throw error;
    }
  },

  async getInvoiceById(id) {
    try {
      const response = await api.get(`/api/invoices/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching invoice:', error);
      throw error;
    }
  }
};