import React from 'react';
import { 
  WrenchScrewdriverIcon, 
  ClockIcon,
  CheckCircleIcon 
} from '@heroicons/react/24/outline';

const PlaceholderPage = () => {
  const pageName = window.location.pathname.split('/').pop().replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <WrenchScrewdriverIcon className="h-10 w-10 text-white" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {pageName} Coming Soon
        </h1>
        
        <p className="text-gray-600 mb-6">
          This feature is currently under development. Our team is working hard to bring you the best experience.
        </p>
        
        <div className="bg-blue-50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center space-x-2 text-blue-700">
            <ClockIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Estimated Release: Next Update</span>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-3 text-sm text-gray-600">
            <CheckCircleIcon className="h-4 w-4 text-green-500" />
            <span>Design & Planning Complete</span>
          </div>
          <div className="flex items-center space-x-3 text-sm text-gray-600">
            <CheckCircleIcon className="h-4 w-4 text-green-500" />
            <span>Development In Progress</span>
          </div>
          <div className="flex items-center space-x-3 text-sm text-gray-400">
            <div className="h-4 w-4 rounded-full border-2 border-gray-300"></div>
            <span>Testing & Quality Assurance</span>
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button 
            onClick={() => window.history.back()}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 px-4 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlaceholderPage;
