import { useToast } from '../components/Toast';

export const handleApiError = (error, customMessage = null) => {
  // Get the toast context
  let toastMessage = customMessage;

  // If no custom message is provided, try to get one from the error response
  if (!customMessage) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      toastMessage = error.response.data.message || 'An error occurred while processing your request';
    } else if (error.request) {
      // The request was made but no response was received
      toastMessage = 'Unable to connect to the server. Please check your internet connection.';
    } else {
      // Something happened in setting up the request that triggered an Error
      toastMessage = 'An unexpected error occurred. Please try again.';
    }
  }

  return {
    type: 'error',
    title: 'Error',
    message: toastMessage,
  };
};

export const handleApiSuccess = (message) => {
  return {
    type: 'success',
    title: 'Success',
    message: message,
  };
};

export const handleApiWarning = (message) => {
  return {
    type: 'warning',
    title: 'Warning',
    message: message,
  };
};

// Higher-order function to wrap API calls with error handling
export const withErrorHandling = async (apiCall, successMessage = null) => {
  try {
    const result = await apiCall();
    if (successMessage) {
      return {
        success: true,
        data: result,
        notification: handleApiSuccess(successMessage)
      };
    }
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error,
      notification: handleApiError(error)
    };
  }
};