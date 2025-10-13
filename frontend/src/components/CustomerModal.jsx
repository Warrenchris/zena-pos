import React, { useState } from 'react';
import { XMarkIcon, UserIcon, MapPinIcon, PhoneIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

const CustomerModal = ({ isOpen, customer, onClose, onSubmit, onSkip }) => {
  // Do not render anything if the modal is not open
  if (!isOpen) return null;

  const [customerData, setCustomerData] = useState({
    name: customer?.name || '',
    location: customer?.location || '',
    phone: customer?.phone || '',
    email: customer?.email || ''
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

  // Note: visibility is controlled by isOpen; no additional guard needed here

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-xl w-full max-w-md transform transition-all scale-100 overflow-hidden border border-yellow-500/20">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-b border-yellow-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-xl flex items-center justify-center shadow-lg ring-4 ring-yellow-500/20">
                <UserIcon className="h-6 w-6 text-black" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-yellow-400">
                  {customer ? 'Edit Customer' : 'Customer Information'}
                </h3>
                <p className="text-sm text-yellow-200/70">
                  {customer ? 'Update customer details' : 'Help us serve you better'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-yellow-500/70 hover:text-yellow-400 hover:bg-yellow-500/10 transition-all"
              aria-label="Close modal"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Content */}
        <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
          <form id="customerForm" onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Name Field */}
            <div className="space-y-2">
              <label htmlFor="customerName" className="block text-sm font-medium text-yellow-300">
                Customer Name <span className="text-yellow-500" aria-hidden="true">*</span>
              </label>
              <div className="relative group">
                <UserIcon className="h-5 w-5 text-yellow-500/50 group-focus-within:text-yellow-400 absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="customerName"
                  type="text"
                  value={customerData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter customer name"
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-yellow-100 bg-gray-800/50 border border-yellow-500/20 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-yellow-500/30 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Location Field */}
            <div className="space-y-2">
              <label htmlFor="location" className="block text-sm font-medium text-yellow-300">
                Location <span className="text-yellow-500/70 text-xs">(Optional)</span>
              </label>
              <div className="relative group">
                <MapPinIcon className="h-5 w-5 text-yellow-500/50 group-focus-within:text-yellow-400 absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="location"
                  type="text"
                  value={customerData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  placeholder="City, District, etc."
                  className="w-full pl-10 pr-4 py-2.5 text-yellow-100 bg-gray-800/50 border border-yellow-500/20 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-yellow-500/30 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Phone Field */}
            <div className="space-y-2">
              <label htmlFor="phone" className="block text-sm font-medium text-yellow-300">
                Phone Number <span className="text-yellow-500/70 text-xs">(Optional)</span>
              </label>
              <div className="relative group">
                <PhoneIcon className="h-5 w-5 text-yellow-500/50 group-focus-within:text-yellow-400 absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="phone"
                  type="tel"
                  value={customerData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full pl-10 pr-4 py-2.5 text-yellow-100 bg-gray-800/50 border border-yellow-500/20 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-yellow-500/30 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-yellow-300">
                Email Address <span className="text-yellow-500/70 text-xs">(Optional)</span>
              </label>
              <div className="relative group">
                <EnvelopeIcon className="h-5 w-5 text-yellow-500/50 group-focus-within:text-yellow-400 absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="email"
                  type="email"
                  value={customerData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full pl-10 pr-4 py-2.5 text-yellow-100 bg-gray-800/50 border border-yellow-500/20 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all placeholder:text-yellow-500/30 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-yellow-500/5 rounded-lg p-4 border border-yellow-500/20">
              <p className="text-sm font-semibold text-yellow-400">
                Why we collect this information:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex items-start space-x-3 text-sm text-yellow-300/90">
                  <svg className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Better customer service and support</span>
                </li>
                <li className="flex items-start space-x-3 text-sm text-yellow-300/90">
                  <svg className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Personalized shopping experience</span>
                </li>
                <li className="flex items-start space-x-3 text-sm text-yellow-300/90">
                  <svg className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Order tracking and delivery updates</span>
                </li>
                <li className="flex items-start space-x-3 text-sm text-yellow-300/90">
                  <svg className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Special offers and promotions</span>
                </li>
              </ul>
            </div>
          </form>
        </div>

        {/* Action Buttons - Fixed at Bottom */}
        <div className="border-t border-yellow-500/20 p-4 bg-black/40">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-yellow-500/30 text-yellow-500 rounded-lg hover:bg-yellow-500/10 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="customerForm"
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-lg font-medium hover:from-yellow-500 hover:to-yellow-600 transition-all duration-200 shadow-lg shadow-yellow-500/25 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              {customer ? 'Update Customer' : 'Create Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerModal;