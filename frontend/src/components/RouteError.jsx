import React from 'react';
import { Link } from 'react-router-dom';
import { ExclamationTriangleIcon, HomeIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

const RouteError = ({ error }) => {
  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600" />
        </div>
        
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Page Not Found
        </h1>
        
        <p className="text-gray-600 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>

        {process.env.NODE_ENV === 'development' && error && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-left">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">Route Error:</h3>
            <pre className="text-xs text-yellow-700 whitespace-pre-wrap overflow-auto max-h-32">
              {error.toString()}
            </pre>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleGoBack}
            className="flex-1 flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Go Back
          </button>
          
          <Link
            to="/dashboard"
            className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <HomeIcon className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Link>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          If you believe this is an error, please contact support.
        </div>
      </div>
    </div>
  );
};

export default RouteError;
