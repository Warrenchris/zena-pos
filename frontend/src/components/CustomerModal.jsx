import React, { useState, useEffect } from 'react';
import { XMarkIcon, UserIcon, MapPinIcon, PhoneIcon, EnvelopeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

const CustomerModal = ({ isOpen, customer, onClose, onSubmit, onSkip }) => {
  if (!isOpen) return null;

  const [customerData, setCustomerData] = useState({
    id: customer?.id || null,
    name: customer?.name || '',
    location: customer?.location || '',
    phone: customer?.phone || '',
    email: customer?.email || ''
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const handler = setTimeout(async () => {
      try {
        const response = await api.get('/api/customers', {
          params: { search: searchQuery }
        });
        const fetchedCustomers = response.data.customers || response.data || [];
        setSearchResults(fetchedCustomers);
      } catch (err) {
        console.error('Customer search failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Reset to walk-in if search query is cleared and no customer is currently selected
  useEffect(() => {
    if (searchQuery === '' && !selectedCustomer) {
      setCustomerData({
        id: null,
        name: '',
        location: '',
        phone: '',
        email: ''
      });
    }
  }, [searchQuery, selectedCustomer]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(customerData);
  };

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerData({
      id: c.id,
      name: c.name,
      location: c.location || '',
      phone: c.phone || '',
      email: c.email || ''
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleClearSelection = () => {
    setSelectedCustomer(null);
    setCustomerData({
      id: null,
      name: '',
      location: '',
      phone: '',
      email: ''
    });
  };

  const handleChange = (field, value) => {
    if (selectedCustomer) return; // Fields are locked
    setCustomerData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const isLocked = !!selectedCustomer;

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
                  {customer ? 'Update customer details' : 'Search or enter new details'}
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
          {/* Customer Search Section */}
          <div className="p-6 pb-0 space-y-2 relative">
            <label className="block text-sm font-medium text-zana-yellow">
              Search Existing Customer
            </label>
            <div className="relative group">
              <MagnifyingGlassIcon className="h-5 w-5 text-zana-yellow/50 group-focus-within:text-zana-yellow absolute left-3 top-1/2 transform -translate-y-1/2 transition-colors" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type name, email, or phone..."
                className="w-full pl-10 pr-4 py-2.5 text-zana-yellow bg-gray-800/50 border border-zana-borderTint rounded-lg focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow transition-all placeholder:text-zana-yellow/40 focus:bg-black/50"
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-zana-yellow border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            {/* Search Dropdown Results */}
            {searchResults.length > 0 && (
              <div className="absolute left-6 right-6 z-50 max-h-48 overflow-y-auto bg-gray-800 border border-zana-borderTint rounded-lg shadow-2xl divide-y divide-gray-700">
                {searchResults.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectCustomer(c)}
                    className="p-3 hover:bg-zana-yellow/10 cursor-pointer transition-colors flex justify-between items-center text-sm bg-gray-800"
                  >
                    <div>
                      <div className="font-bold text-zana-yellow">{c.name}</div>
                      <div className="text-xs text-zana-yellow/60">{c.phone || 'No Phone'} • {c.email || 'No Email'}</div>
                    </div>
                    <div className="text-right text-xs text-zana-yellow/80">
                      <div>Purchases: KES {parseFloat(c.totalPurchases || 0).toFixed(2)}</div>
                      <div>Points: {c.loyaltyPoints || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Indicators */}
            {searchQuery.trim() && searchResults.length === 0 && !isSearching && (
              <div className="text-xs text-yellow-500 font-semibold mt-1">
                ⚠️ New customer — will be created on checkout
              </div>
            )}
            {selectedCustomer && (
              <div className="flex justify-between items-center bg-zana-yellow/10 p-3 rounded-lg border border-zana-yellow/20 mt-2">
                <div className="text-xs text-zana-yellow font-medium">
                  Linked Customer: <span className="font-bold">{selectedCustomer.name}</span>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold underline transition-colors"
                >
                  Change customer
                </button>
              </div>
            )}
          </div>

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
                  readOnly={isLocked}
                  className={`w-full pl-10 pr-4 py-2.5 text-zana-yellow border rounded-lg focus:ring-2 transition-all placeholder:text-zana-yellow/40 ${
                    isLocked
                      ? 'bg-gray-800/20 text-gray-400 border-gray-800 cursor-not-allowed focus:ring-0'
                      : 'bg-gray-800/50 border-zana-borderTint focus:ring-zana-yellow focus:border-zana-yellow focus:bg-black/50'
                  }`}
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
                  readOnly={isLocked}
                  className={`w-full pl-10 pr-4 py-2.5 text-zana-yellow border rounded-lg focus:ring-2 transition-all placeholder:text-zana-yellow/40 ${
                    isLocked
                      ? 'bg-gray-800/20 text-gray-400 border-gray-800 cursor-not-allowed focus:ring-0'
                      : 'bg-gray-800/50 border-zana-borderTint focus:ring-zana-yellow focus:border-zana-yellow focus:bg-black/50'
                  }`}
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
                  readOnly={isLocked}
                  className={`w-full pl-10 pr-4 py-2.5 text-zana-yellow border rounded-lg focus:ring-2 transition-all placeholder:text-zana-yellow/40 ${
                    isLocked
                      ? 'bg-gray-800/20 text-gray-400 border-gray-800 cursor-not-allowed focus:ring-0'
                      : 'bg-gray-800/50 border-zana-borderTint focus:ring-zana-yellow focus:border-zana-yellow focus:bg-black/50'
                  }`}
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
                  readOnly={isLocked}
                  className={`w-full pl-10 pr-4 py-2.5 text-zana-yellow border rounded-lg focus:ring-2 transition-all placeholder:text-zana-yellow/40 ${
                    isLocked
                      ? 'bg-gray-800/20 text-gray-400 border-gray-800 cursor-not-allowed focus:ring-0'
                      : 'bg-gray-800/50 border-zana-borderTint focus:ring-zana-yellow focus:border-zana-yellow focus:bg-black/50'
                  }`}
                />
              </div>
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
              {customer ? 'Update Customer' : isLocked ? 'Select Customer' : 'Create Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerModal;