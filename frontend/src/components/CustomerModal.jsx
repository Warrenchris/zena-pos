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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className="bg-gray-900 rounded-2xl shadow-zana w-full max-w-md transform transition-all overflow-hidden border border-zana-borderTint animate-scaleIn">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-zana-yellow/10 to-zana-yellow/10 border-b border-zana-borderTint">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-zana-yellow to-zana-yellow rounded-xl flex items-center justify-center shadow-zana ring-4 ring-zana-yellow/20">
                <UserIcon className="h-6 w-6 text-black" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zana-yellow">
                  {customer ? 'Edit Customer' : 'Customer Information'}
                </h3>
                <p className="text-sm text-zana-yellow/70">
                  {customer ? 'Update customer details' : 'Help us serve you better'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-zana-yellow/70 hover:text-zana-yellow hover:bg-zana-yellow/10 transition-all"
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
              <label htmlFor="customerName" className="block text-sm font-medium text-zana-yellow">
                Customer Name <span className="text-yellow-500" aria-hidden="true">*</span>
              </label>
              <div className="relative group">
                <UserIcon className="h-5 w-5 text-zana-yellow/50 group-focus-within:text-zana-yellow absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="customerName"
                  type="text"
                  value={customerData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter customer name"
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-zana-yellow bg-gray-800/50 border border-zana-borderTint rounded-lg focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow transition-all placeholder:text-zana-yellow/40 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Location Field */}
            <div className="space-y-2">
              <label htmlFor="location" className="block text-sm font-medium text-zana-yellow">
                Location <span className="text-yellow-500/70 text-xs">(Optional)</span>
              </label>
              <div className="relative group">
                <MapPinIcon className="h-5 w-5 text-zana-yellow/50 group-focus-within:text-zana-yellow absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="location"
                  type="text"
                  value={customerData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  placeholder="City, District, etc."
                  className="w-full pl-10 pr-4 py-2.5 text-zana-yellow bg-gray-800/50 border border-zana-borderTint rounded-lg focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow transition-all placeholder:text-zana-yellow/40 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Phone Field */}
            <div className="space-y-2">
              <label htmlFor="phone" className="block text-sm font-medium text-zana-yellow">
                Phone Number <span className="text-yellow-500/70 text-xs">(Optional)</span>
              </label>
              <div className="relative group">
                <PhoneIcon className="h-5 w-5 text-zana-yellow/50 group-focus-within:text-zana-yellow absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="phone"
                  type="tel"
                  value={customerData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full pl-10 pr-4 py-2.5 text-zana-yellow bg-gray-800/50 border border-zana-borderTint rounded-lg focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow transition-all placeholder:text-zana-yellow/40 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-zana-yellow">
                Email Address <span className="text-yellow-500/70 text-xs">(Optional)</span>
              </label>
              <div className="relative group">
                <EnvelopeIcon className="h-5 w-5 text-zana-yellow/50 group-focus-within:text-zana-yellow absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
                <input
                  id="email"
                  type="email"
                  value={customerData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full pl-10 pr-4 py-2.5 text-zana-yellow bg-gray-800/50 border border-zana-borderTint rounded-lg focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow transition-all placeholder:text-zana-yellow/40 focus:bg-black/50"
                />
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-zana-yellow/5 rounded-lg p-4 border border-zana-borderTint">
              <p className="text-sm font-semibold text-zana-yellow">
                Why we collect this information:
              </p>
              <ul className="mt-3 space-y-2">
                <li className="flex items-start space-x-3 text-sm text-zana-yellow/90">
                  <svg className="h-5 w-5 text-zana-yellow mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Better customer service and support</span>
                </li>
                <li className="flex items-start space-x-3 text-sm text-zana-yellow/90">
                  <svg className="h-5 w-5 text-zana-yellow mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Personalized shopping experience</span>
                </li>
                <li className="flex items-start space-x-3 text-sm text-zana-yellow/90">
                  <svg className="h-5 w-5 text-zana-yellow mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Order tracking and delivery updates</span>
                </li>
                <li className="flex items-start space-x-3 text-sm text-zana-yellow/90">
                  <svg className="h-5 w-5 text-zana-yellow mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Special offers and promotions</span>
                </li>
              </ul>
            </div>
          </form>
        </div>

        {/* Action Buttons - Fixed at Bottom */}
        <div className="border-t border-zana-borderTint p-4 bg-black/40">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-zana-borderTint text-zana-yellow rounded-lg hover:bg-zana-yellow/10 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-zana-yellow"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="customerForm"
              className="flex-1 py-2.5 px-4 bg-zana-yellow text-black rounded-lg font-medium hover:bg-zana-yellow/90 transition-all duration-200 shadow-zana focus:outline-none focus:ring-2 focus:ring-zana-yellow"
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