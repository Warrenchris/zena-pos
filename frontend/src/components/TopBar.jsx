import React from 'react';
import {
  MagnifyingGlassIcon,
  BellIcon,
  UserIcon,
  ChevronDownIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

export default function TopBar({ user, onNewSale }) {
  return (
    <div className="sticky top-0 z-40 bg-brand-gray/95 backdrop-blur-sm border-b border-brand-yellow/20">
      <div className="flex items-center justify-between h-16 px-6">
        {/* Left section - Store selector */}
        <div className="flex items-center space-x-4">
          <select className="form-select bg-black/30 border border-brand-yellow/20 rounded-lg text-gray-300 px-4 py-2 pr-8 hover:border-brand-yellow focus:outline-none focus:ring-2 focus:ring-brand-yellow/20 focus:border-brand-yellow transition-all duration-300">
            <option>Main Store</option>
            <option>Branch Store</option>
          </select>
        </div>

        {/* Center section - Search */}
        <div className="flex-1 max-w-2xl mx-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search products, orders, or customers..."
              className="w-full bg-black/30 border border-brand-yellow/20 rounded-lg pl-10 pr-4 py-2 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-yellow/20 focus:border-brand-yellow transition-all duration-300"
            />
          </div>
        </div>

        {/* Right section - Actions */}
        <div className="flex items-center space-x-6">
          {/* New Sale Button */}
          <button
            onClick={onNewSale}
            className="flex items-center px-4 py-2 bg-gradient-to-r from-brand-yellow to-yellow-500 text-black font-semibold rounded-lg shadow-lg hover:from-yellow-500 hover:to-brand-yellow transition-all duration-300 hover:scale-105"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            New Sale
          </button>

          {/* Notifications */}
          <button className="relative group">
            <BellIcon className="h-6 w-6 text-gray-400 hover:text-brand-yellow transition-colors duration-300" />
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs flex items-center justify-center rounded-full">
              3
            </span>
            <div className="hidden group-hover:block absolute right-0 mt-2 w-80 bg-brand-gray border border-brand-yellow/20 rounded-lg shadow-xl p-4">
              <div className="text-sm text-gray-300">
                <div className="font-semibold mb-2">Recent Notifications</div>
                {/* Notification items would go here */}
              </div>
            </div>
          </button>

          {/* User Profile */}
          <div className="relative group">
            <button className="flex items-center space-x-3 text-gray-300 hover:text-brand-yellow transition-colors duration-300">
              <div className="h-8 w-8 bg-brand-yellow/20 rounded-lg flex items-center justify-center">
                <UserIcon className="h-5 w-5" />
              </div>
              <span className="font-medium">{user?.name || 'User'}</span>
              <ChevronDownIcon className="h-4 w-4" />
            </button>

            <div className="hidden group-hover:block absolute right-0 mt-2 w-48 bg-brand-gray border border-brand-yellow/20 rounded-lg shadow-xl">
              <div className="py-1">
                <a href="#profile" className="block px-4 py-2 text-sm text-gray-300 hover:bg-brand-yellow/10 hover:text-brand-yellow">
                  Your Profile
                </a>
                <a href="#settings" className="block px-4 py-2 text-sm text-gray-300 hover:bg-brand-yellow/10 hover:text-brand-yellow">
                  Settings
                </a>
                <a href="#logout" className="block px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-500">
                  Sign out
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}