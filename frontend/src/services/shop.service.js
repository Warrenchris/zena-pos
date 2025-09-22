import api from './api';

const getMine = async () => {
  try {
    const response = await api.get('/api/shop/me');
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    console.error('Error fetching my shop:', error);
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