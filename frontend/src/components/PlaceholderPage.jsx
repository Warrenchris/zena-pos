import React from 'react';
import { 
  ExclamationTriangleIcon,
  ArrowLeftIcon 
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const PlaceholderPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600" />
      </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Coming Soon
        </h1>
        
        <p className="text-gray-600 mb-6">
          This feature is currently under development. We're working hard to bring you the best experience.
        </p>
        
        <div className="space-y-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-brand-yellow text-brand-black px-4 py-2 rounded-lg font-medium hover:bg-yellow-400 transition-colors duration-200 flex items-center justify-center"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Dashboard
          </button>
          
          <button
            onClick={() => window.history.back()}
            className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors duration-200"
          >
            Go Back
            </button>
          </div>
      </div>
    </div>
  );
};

export default PlaceholderPage;
