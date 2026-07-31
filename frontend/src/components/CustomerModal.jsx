import React, { useState, useEffect } from 'react';
import { UserIcon, MapPinIcon, PhoneIcon, EnvelopeIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import api from '../services/api';
import Modal from './ui/Modal';
import Input from './ui/Input';
import Button from './ui/Button';

const CustomerModal = ({ isOpen = false, customer, onClose, onSubmit }) => {

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
    if (selectedCustomer) return;
    setCustomerData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const isLocked = !!selectedCustomer;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer ? 'Edit Customer' : 'Customer Account Information'}
      description={customer ? 'Update customer details and contact info.' : 'Search existing customer database or create a new profile.'}
    >
      <div className="space-y-4">
        {/* Customer Search Section */}
        <div className="relative space-y-1.5">
          <Input
            label="Search Existing Database"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone number..."
            leftIcon={MagnifyingGlassIcon}
          />

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 z-50 max-h-48 overflow-y-auto bg-surface border border-border-default rounded-xl shadow-modal divide-y divide-border-default mt-1">
              {searchResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSelectCustomer(c)}
                  className="p-3 hover:bg-surface-2 cursor-pointer transition-colors flex justify-between items-center text-small"
                >
                  <div>
                    <div className="font-bold text-text-primary">{c.name}</div>
                    <div className="text-caption text-text-muted">{c.phone || 'No Phone'} • {c.email || 'No Email'}</div>
                  </div>
                  <div className="text-right text-caption text-text-muted">
                    <div>Points: {c.loyaltyPoints || 0}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selectedCustomer && (
            <div className="flex justify-between items-center bg-primary/10 p-3 rounded-xl border border-primary/20 mt-2">
              <div className="text-small text-primary font-medium">
                Linked Customer: <span className="font-bold">{selectedCustomer.name}</span>
              </div>
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-caption text-danger hover:underline font-semibold"
              >
                Change customer
              </button>
            </div>
          )}
        </div>

        <form id="customerForm" onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            id="customerName"
            label="Customer Name"
            required
            value={customerData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Enter customer name"
            disabled={isLocked}
            leftIcon={UserIcon}
          />

          <Input
            id="location"
            label="Location"
            value={customerData.location}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder="City, District, etc."
            disabled={isLocked}
            leftIcon={MapPinIcon}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="phone"
              type="tel"
              label="Phone Number"
              value={customerData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="+1 (555) 123-4567"
              disabled={isLocked}
              leftIcon={PhoneIcon}
            />

            <Input
              id="email"
              type="email"
              label="Email Address"
              value={customerData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="customer@example.com"
              disabled={isLocked}
              leftIcon={EnvelopeIcon}
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-border-default">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {customer ? 'Update Profile' : isLocked ? 'Link Customer' : 'Save Customer'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default CustomerModal;