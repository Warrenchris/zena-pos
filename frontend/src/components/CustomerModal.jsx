import React, { useState } from 'react';
import { XMarkIcon, UserIcon, MapPinIcon, PhoneIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

const CustomerModal = ({ isOpen, onClose, onSubmit, onSkip }) => {
  const [customerData, setCustomerData] = useState({
    name: '',
    location: '',
    phone: '',
    email: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(customerData);
  };

  const handleSkip = () => {
    onSkip();
  };

  const handleChange = (field, value) => {
    setCustomerData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <UserIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">Customer Information</h3>
              <p className="text-sm text-gray-600">Help us serve you better</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Name *
            </label>
            <input
              type="text"
              value={customerData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter customer name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MapPinIcon className="h-4 w-4 inline mr-1" />
              Location (Optional)
            </label>
            <input
              type="text"
              value={customerData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="City, District, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <PhoneIcon className="h-4 w-4 inline mr-1" />
              Phone Number (Optional)
            </label>
            <input
              type="tel"
              value={customerData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <EnvelopeIcon className="h-4 w-4 inline mr-1" />
              Email Address (Optional)
            </label>
            <input
              type="email"
              value={customerData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="customer@example.com"
            />
          </div>

          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              <strong>Why we collect this information:</strong>
            </p>
            <ul className="text-sm text-blue-700 mt-2 space-y-1">
              <li>• Better customer service and support</li>
              <li>• Personalized shopping experience</li>
              <li>• Order tracking and delivery updates</li>
              <li>• Special offers and promotions</li>
            </ul>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Skip for Now
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
            >
              Continue to Products
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomerModal;