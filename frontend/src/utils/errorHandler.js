import { useToast } from '../components/Toast';

export class AppError extends Error {
  constructor(message, type = 'error', details = {}) {
    super(message);
    this.type = type;
    this.details = details;
  }
}

export const errorTypes = {
  NETWORK: 'NETWORK',
  VALIDATION: 'VALIDATION',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  NOT_FOUND: 'NOT_FOUND',
  SERVER: 'SERVER',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN'
};

export const useErrorHandler = () => {
  const { showToast } = useToast();

  const handleError = (error, customMessages = {}) => {
    let title = 'Error';
    let message = 'An unexpected error occurred';
    let type = 'error';
    let duration = 5000;

    // Network errors
    if (error.name === 'NetworkError' || !navigator.onLine) {
      title = 'Connection Error';
      message = 'Please check your internet connection and try again';
      type = 'error';
    }
    // Timeout errors
    else if (error.name === 'TimeoutError') {
      title = 'Request Timeout';
      message = 'The server took too long to respond. Please try again';
      type = 'warning';
    }
    // Validation errors
    else if (error.type === errorTypes.VALIDATION) {
      title = 'Validation Error';
      message = error.message || 'Please check your input and try again';
      type = 'warning';
    }
    // Authentication errors
    else if (error.type === errorTypes.AUTHENTICATION) {
      title = 'Authentication Error';
      message = 'Please log in again to continue';
      type = 'error';
      duration = 7000;
    }
    // Authorization errors
    else if (error.type === errorTypes.AUTHORIZATION) {
      title = 'Access Denied';
      message = 'You do not have permission to perform this action';
      type = 'error';
    }
    // Not found errors
    else if (error.type === errorTypes.NOT_FOUND) {
      title = 'Not Found';
      message = 'The requested resource could not be found';
      type = 'warning';
    }
    // Server errors
    else if (error.type === errorTypes.SERVER) {
      title = 'Server Error';
      message = 'Something went wrong on our end. Please try again later';
      type = 'error';
      duration = 7000;
    }
    // Custom error messages
    if (customMessages[error.type]) {
      const custom = customMessages[error.type];
      title = custom.title || title;
      message = custom.message || message;
      type = custom.type || type;
      duration = custom.duration || duration;
    }

    showToast({
      type,
      title,
      message,
      duration
    });

    // Return the error details for additional handling if needed
    return {
      type,
      title,
      message,
      originalError: error
    };
  };

  return { handleError };
};

export const createError = (type, message, details = {}) => {
  return new AppError(message, type, details);
};

// Example usage:
// const error = createError(errorTypes.VALIDATION, 'Invalid input', { field: 'email' });
// handleError(error, {
//   [errorTypes.VALIDATION]: {
//     title: 'Custom Validation Error',
//     message: 'Please fix the following issues:',
//     type: 'warning'
//   }
// });