import { useState, useCallback } from 'react';

/**
 * Custom hook for comprehensive error handling
 * @param {Object} options - Error handling options
 * @returns {Object} Error handling utilities
 */
export const useErrorHandler = (options = {}) => {
  const {
    onError = null,
    showToast = true,
    logToConsole = true
  } = options;

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handle API errors
   * @param {Error} error - Error object
   * @param {string} context - Error context
   */
  const handleError = useCallback((error, context = '') => {
    const errorMessage = error?.response?.data?.error || 
                       error?.message || 
                       'An unexpected error occurred';
    
    const errorDetails = {
      message: errorMessage,
      context,
      timestamp: new Date().toISOString(),
      status: error?.response?.status,
      data: error?.response?.data
    };

    if (logToConsole) {
      console.error(`Error in ${context}:`, errorDetails);
    }

    if (onError) {
      onError(errorDetails);
    }

    setErrors(prev => ({
      ...prev,
      [context]: errorMessage
    }));

    setIsLoading(false);
  }, [onError, logToConsole]);

  /**
   * Handle validation errors
   * @param {Object} validationErrors - Validation errors object
   */
  const handleValidationErrors = useCallback((validationErrors) => {
    setErrors(prev => ({
      ...prev,
      ...validationErrors
    }));
  }, []);

  /**
   * Clear specific error
   * @param {string} field - Field name to clear error for
   */
  const clearError = useCallback((field) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  /**
   * Clear all errors
   */
  const clearAllErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * Get error for specific field
   * @param {string} field - Field name
   * @returns {string|null} Error message or null
   */
  const getError = useCallback((field) => {
    return errors[field] || null;
  }, [errors]);

  /**
   * Check if there are any errors
   * @returns {boolean} True if there are errors
   */
  const hasErrors = useCallback(() => {
    return Object.keys(errors).length > 0;
  }, [errors]);

  /**
   * Execute async operation with error handling
   * @param {Function} operation - Async operation to execute
   * @param {string} context - Error context
   * @returns {Promise} Promise that resolves with result or rejects with error
   */
  const executeWithErrorHandling = useCallback(async (operation, context = '') => {
    try {
      setIsLoading(true);
      clearAllErrors();
      const result = await operation();
      setIsLoading(false);
      return result;
    } catch (error) {
      handleError(error, context);
      throw error;
    }
  }, [handleError, clearAllErrors]);

  /**
   * Handle form submission with error handling
   * @param {Function} submitFunction - Form submission function
   * @param {Object} formData - Form data
   * @param {Function} validationFunction - Validation function
   * @returns {Promise} Promise that resolves with result or rejects with error
   */
  const handleFormSubmission = useCallback(async (submitFunction, formData, validationFunction = null) => {
    try {
      setIsLoading(true);
      clearAllErrors();

      // Run validation if provided
      if (validationFunction) {
        const validationResult = validationFunction(formData);
        if (!validationResult.isValid) {
          handleValidationErrors(validationResult.errors);
          setIsLoading(false);
          return;
        }
      }

      const result = await submitFunction(formData);
      setIsLoading(false);
      return result;
    } catch (error) {
      handleError(error, 'form_submission');
      throw error;
    }
  }, [handleError, handleValidationErrors, clearAllErrors]);

  return {
    errors,
    isLoading,
    handleError,
    handleValidationErrors,
    clearError,
    clearAllErrors,
    getError,
    hasErrors,
    executeWithErrorHandling,
    handleFormSubmission
  };
};

export default useErrorHandler;
