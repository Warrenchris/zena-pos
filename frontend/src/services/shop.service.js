import api from './api';

const getMine = async () => {
  try {
    const response = await api.get('/api/shop/me');
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 404 || status === 401 || status === 403) {
      // Gracefully degrade when unauthorized/forbidden or not found
      return null;
    }
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
      // Log only in development for unexpected errors
      // eslint-disable-next-line no-console
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

export default {
  getMine,
  updateMine,
};