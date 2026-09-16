import api from './api';

/**
 * Billing Service
 * Handles API communication for plans, subscriptions, and billing invoices.
 */

const getPlans = async () => {
  try {
    const response = await api.get('/api/billing/plans');
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.error('Error fetching billing plans:', error);
    }
    throw error;
  }
};

const getSubscription = async () => {
  try {
    const response = await api.get('/api/billing/subscription');
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.error('Error fetching subscription:', error);
    }
    throw error;
  }
};

const getInvoices = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await api.get('/api/billing/invoices', {
      params: { page, limit }
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.error('Error fetching billing invoices:', error);
    }
    throw error;
  }
};

export default {
  getPlans,
  getSubscription,
  getInvoices,
};
