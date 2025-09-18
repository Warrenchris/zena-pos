import React, { useState } from 'react';
import { HiSearch, HiChevronDown, HiBell } from 'react-icons/hi';
import { Menu, Transition } from '@headlessui/react';

const AnalyticsHeader = () => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="flex items-center justify-between p-4 bg-white shadow-sm rounded-xl">
      {/* Search Bar */}
      <div className="relative flex-1 max-w-xl">
        <div className="relative">
          <HiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search analytics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center space-x-4">
        {/* Date Range Selector */}
        <select className="border-gray-200 rounded-lg text-sm text-gray-600 focus:ring-blue-500">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
          <option>This year</option>
        </select>

        {/* Export Button */}
        <button className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
          Export Data
        </button>
      </div>
    </header>
  );
};

export default AnalyticsHeader;