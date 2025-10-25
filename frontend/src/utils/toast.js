// Simple toast implementation to replace react-hot-toast temporarily
let toastContainer = null;

const createToastContainer = () => {
  if (toastContainer) return toastContainer;
  
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    pointer-events: none;
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
};

const createToast = (message, type = 'success') => {
  const container = createToastContainer();
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    max-width: 300px;
    word-wrap: break-word;
  `;
  
  toast.textContent = message;
  container.appendChild(toast);
  
  // Animate in
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
  }, 10);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
  
  return toast;
};

export const toast = {
  success: (message) => createToast(message, 'success'),
  error: (message) => createToast(message, 'error'),
  info: (message) => createToast(message, 'info'),
  warning: (message) => createToast(message, 'warning'),
  loading: (message) => createToast(message, 'info'),
  promise: (promise, messages) => {
    const loadingToast = createToast(messages.loading || 'Loading...', 'info');
    
    return promise
      .then((result) => {
        if (loadingToast.parentNode) {
          loadingToast.parentNode.removeChild(loadingToast);
        }
        createToast(messages.success || 'Success!', 'success');
        return result;
      })
      .catch((error) => {
        if (loadingToast.parentNode) {
          loadingToast.parentNode.removeChild(loadingToast);
        }
        createToast(messages.error || 'Error occurred', 'error');
        throw error;
      });
  }
};
