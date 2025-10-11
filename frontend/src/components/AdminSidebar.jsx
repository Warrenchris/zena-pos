import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon,
  Cog6ToothIcon,
  TagIcon,
  CubeIcon,
  BanknotesIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  BuildingStorefrontIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const AdminSidebar = ({ isOpen, onClose, user, variant = 'admin' }) => {
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState(null);
  
  const adminSections = [
    {
      title: 'Main',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
        { name: 'Sales', path: '/sales', icon: BanknotesIcon },
        { name: 'Products', path: '/products', icon: CubeIcon },
        { name: 'Categories', path: '/categories', icon: TagIcon },
        { name: 'Customers', path: '/customers', icon: UserGroupIcon },
        { name: 'Expenses', path: '/expenses', icon: CurrencyDollarIcon },
        { name: 'Reports', path: '/reports', icon: ChartBarIcon },
      ]
    },
    {
      title: 'Admin',
      items: [
        { name: 'Employees', path: '/admin/employees', icon: UserGroupIcon },
        { name: 'Settings', path: '/settings', icon: Cog6ToothIcon }
      ]
    }
  ];

  const cashierSections = [
    {
      title: 'Main',
      items: [
        { name: 'POS', path: '/dashboard', icon: ShoppingCartIcon },
        { name: 'My Sales', path: '/sales', icon: BanknotesIcon }
      ]
    }
  ];

  const sidebarSections = variant === 'admin' ? adminSections : cashierSections;

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const renderNavItem = (item) => {
    const active = isActive(item.path);
    const isHovered = hoveredItem === item.path;
    
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
          active
            ? 'bg-brand-yellow text-brand-black shadow-lg'
            : 'text-gray-300 hover:bg-black/40 hover:text-gray-100'
        }`}
        onMouseEnter={() => setHoveredItem(item.path)}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <item.icon
          className={`mr-3 flex-shrink-0 h-5 w-5 transition-colors duration-200 ${
            active || isHovered
              ? 'text-brand-black'
              : 'text-gray-400 group-hover:text-gray-200'
          }`}
        />
        <span className="truncate">{item.name}</span>
        {active && (
          <div className="ml-auto w-2 h-2 bg-brand-black rounded-full opacity-80"></div>
        )}
      </Link>
    );
  };

  const renderSection = (section) => {
    return (
      <div key={section.title} className="mb-6">
        <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          {section.title}
        </h3>
        <div className="space-y-1">
          {section.items.map(item => renderNavItem(item))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={`fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300 ease-in-out lg:hidden ${
          isOpen ? 'opacity-100 z-40' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-brand-gray/95 backdrop-blur-sm border-r border-brand-yellow/20 shadow-2xl transform transition-all duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex h-full flex-col">
          {/* Header with Logo */}
          <div className="flex items-center justify-between h-20 px-6 border-b border-brand-yellow/20 bg-black/80 backdrop-blur-sm">
            <div className="flex items-center justify-center w-full">
              <div className="w-10 h-10 bg-gradient-to-tr from-brand-yellow to-yellow-400 rounded-xl flex items-center justify-center shadow-lg transform transition-transform duration-300 hover:scale-105">
                <BuildingStorefrontIcon className="h-6 w-6 text-brand-black" />
              </div>
              <div className="ml-3">
                <h1 className="text-xl font-bold bg-gradient-to-r from-brand-yellow to-yellow-400 bg-clip-text text-transparent">
                  {variant === 'admin' ? 'Admin Panel' : 'Cashier Panel'}
                </h1>
                <p className="text-xs text-gray-400">
                  {variant === 'admin' ? 'Business Management' : 'Point of Sale'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-lg text-gray-200 hover:text-gray-100"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation Items */}
          <div className="flex-1 overflow-y-auto">
            <nav className="px-4 py-6 space-y-6">
              {sidebarSections.map(renderSection)}
            </nav>
          </div>

          {/* User Info */}
          <div className="p-4 border-t border-brand-yellow/20 bg-black/40">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-brand-yellow flex items-center justify-center">
                  <span className="text-brand-black font-semibold text-sm">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-200">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-400">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminSidebar;