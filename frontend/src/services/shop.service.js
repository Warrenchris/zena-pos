import api from './api';

const getMine = async () => {
  try {
    const response = await api.get('/api/shop/me');
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 404) {
      return null; // Shop not found
    }
    if (status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }
    if (status === 403) {
      // User doesn't have admin permissions - return minimal shop info from auth
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      return currentUser.shop || null;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.error('Error fetching my shop:', error);
    }
    throw error;
  }
};

const updateMine = async (shopData) => {
  try {
    const response = await api.put('/api/shop/me', shopData);
    return response.data;
  } catch (error) {
    console.error('Error updating shop:', error);
    throw error;
  }
};

const getAccessibleShops = async () => {
  try {
    const response = await api.get('/api/shop/accessible');
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.error('Error fetching accessible shops:', error);
    }
    throw error;
  }
};

const createShop = async (payload) => {
  try {
    const response = await api.post('/api/shop', payload);
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      console.error('Error creating shop:', error);
    }
    throw error;
  }
};

export default {
  getMine,
  updateMine,
  getAccessibleShops,
  getAccessible: getAccessibleShops,
  createShop,
};