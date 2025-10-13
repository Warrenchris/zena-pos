import { useState } from 'react';
import { useToast } from '../components/Toast';
import { withErrorHandling } from './apiErrorHandler';

export function useApiWithToast() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const executeApiCall = async (apiCall, successMessage = null) => {
    setLoading(true);
    try {
      const result = await withErrorHandling(apiCall, successMessage);
      if (result.notification) {
        showToast(result.notification);
      }
      setLoading(false);
      return result;
    } catch (error) {
      setLoading(false);
      showToast({
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred'
      });
      return { success: false, error };
    }
  };

  return {
    loading,
    executeApiCall
  };
}