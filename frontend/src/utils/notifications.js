import { store } from '../store';
import { addNotification } from '../store/slices/notificationsSlice';

/**
 * Helper function to show both toast notification and add to notification list
 * @param {Object} params - Notification parameters
 * @param {string} params.type - Type of notification (sale, low_stock, payment, success, warning, error, info)
 * @param {string} params.title - Title of the notification
 * @param {string} params.message - Message content
 * @param {number} params.duration - Toast duration in ms (default: 4000)
 * @param {boolean} params.showToast - Whether to show toast notification (default: true)
 * @param {boolean} params.showSnackbar - Whether to show snackbar notification (default: false)
 * @param {boolean} params.showInPanel - Whether to add to notification panel (default: true)
 * @param {Object} params.action - Optional action button for snackbar { label: string, onClick: function }
 */
export const notify = ({ 
  type = 'info', 
  title, 
  message, 
  duration = 4000,
  showToast = true,
  showSnackbar = false,
  showInPanel = true,
  action = null
}) => {
  const toastTypeMap = {
    'sale': 'success',
    'low_stock': 'warning',
    'payment': 'info',
    'success': 'success',
    'warning': 'warning',
    'error': 'error',
    'info': 'info'
  };

  // Add to notification panel
  if (showInPanel) {
    store.dispatch(addNotification({ type, title, message }));
  }

  // Show toast if requested (for important notifications)
  if (showToast && typeof window !== 'undefined' && window.showToast) {
    window.showToast({
      type: toastTypeMap[type] || 'info',
      title,
      message,
      duration
    });
  }

  // Show snackbar if requested (for subtle notifications)
  if (showSnackbar && typeof window !== 'undefined' && window.showSnackbar) {
    window.showSnackbar({
      type: toastTypeMap[type] || 'info',
      message: message || title,
      duration: duration || 3000,
      action
    });
  }
};

/**
 * Success notification
 */
export const notifySuccess = (title, message, { snackbar = false, action } = {}) => {
  notify({ type: 'success', title, message, showSnackbar: snackbar, action });
};

/**
 * Error notification
 */
export const notifyError = (title, message, { snackbar = false, action } = {}) => {
  notify({ type: 'error', title, message, showSnackbar: snackbar, action });
};

/**
 * Warning notification
 */
export const notifyWarning = (title, message, { snackbar = false, action } = {}) => {
  notify({ type: 'warning', title, message, showSnackbar: snackbar, action });
};

/**
 * Info notification
 */
export const notifyInfo = (title, message, { snackbar = false, action } = {}) => {
  notify({ type: 'info', title, message, showSnackbar: snackbar, action });
};

/**
 * Quick snackbar notification (no toast, just snackbar)
 */
export const showSnackbar = (message, type = 'info', duration = 3000, action) => {
  if (typeof window !== 'undefined' && window.showSnackbar) {
    window.showSnackbar({ type, message, duration, action });
  }
};

/**
 * Sale completed notification
 */
export const notifySaleComplete = (saleData) => {
  const total = saleData.total || saleData.totalAmount || 0;
  notify({
    type: 'sale',
    title: 'Sale Completed',
    message: `Sale #${saleData.invoiceNumber || 'N/A'} - Total: $${total.toFixed(2)}`
  });
};

/**
 * Low stock notification
 */
export const notifyLowStock = (productName, currentStock, reorderPoint) => {
  notify({
    type: 'low_stock',
    title: 'Low Stock Alert',
    message: `${productName} is running low. Current stock: ${currentStock} (Reorder at: ${reorderPoint})`,
    duration: 6000
  });
};

/**
 * Payment notification
 */
export const notifyPayment = (title, message) => {
  notify({
    type: 'payment',
    title,
    message,
    duration: 5000
  });
};

/**
 * Export default notify function
 */
export default notify;

