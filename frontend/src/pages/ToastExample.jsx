import React from 'react';
import { useToast } from '../components/Toast';

export default function ToastExample() {
  const { showToast } = useToast();

  const showSuccessToast = () => {
    showToast({
      type: 'success',
      title: 'Success!',
      message: 'Order has been successfully processed'
    });
  };

  const showErrorToast = () => {
    showToast({
      type: 'error',
      title: 'Error',
      message: 'Unable to process payment. Please try again.'
    });
  };

  const showWarningToast = () => {
    showToast({
      type: 'warning',
      title: 'Low Stock Alert',
      message: 'Some items in your inventory are running low'
    });
  };

  const showInfoToast = () => {
    showToast({
      type: 'info',
      title: 'New Update Available',
      message: 'A new version of the system is available'
    });
  };

  const showCustomDurationToast = () => {
    showToast({
      type: 'info',
      title: 'Custom Duration',
      message: 'This toast will stay for 8 seconds',
      duration: 8000
    });
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-6">Toast Notification Examples</h1>
      
      <div className="space-y-4">
        <button
          onClick={showSuccessToast}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Show Success Toast
        </button>

        <button
          onClick={showErrorToast}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Show Error Toast
        </button>

        <button
          onClick={showWarningToast}
          className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
        >
          Show Warning Toast
        </button>

        <button
          onClick={showInfoToast}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Show Info Toast
        </button>

        <button
          onClick={showCustomDurationToast}
          className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Show Long Duration Toast (8s)
        </button>
      </div>

      <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Usage Instructions:</h2>
        <ul className="list-disc list-inside space-y-2 text-sm">
          <li>Success toasts: Use for successful operations</li>
          <li>Error toasts: Use for operation failures and errors</li>
          <li>Warning toasts: Use for important alerts and warnings</li>
          <li>Info toasts: Use for general information and updates</li>
          <li>Custom duration: Default is 4s, can be customized</li>
        </ul>
      </div>
    </div>
  );
}