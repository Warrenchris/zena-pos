/**
 * A higher-order function that wraps click event handlers to add a trust check
 * This helps prevent accidental double clicks and ensures intentional user actions
 * 
 * @param {Function} handler - The original click handler function
 * @returns {Function} - A wrapped function that includes trust verification
 */
export const withTrustedClick = (handler) => {
  return (event) => {
    // Prevent default browser behavior
    if (event) {
      event.preventDefault();
    }

    // Add a small delay to prevent double clicks
    if (!window.lastClickTime || Date.now() - window.lastClickTime > 300) {
      window.lastClickTime = Date.now();
      
      // Call the original handler
      return handler(event);
    }
  };
};