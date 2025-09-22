import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon,
  Cog6ToothIcon,
  Squares2X2Icon,
  RectangleStackIcon,
  CubeIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  TagIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CubeTransparentIcon,
  SparklesIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  ArrowUturnLeftIcon,
  DocumentDuplicateIcon,
  ReceiptPercentIcon,
  GiftIcon,
  BanknotesIcon,
  ShoppingCartIcon,
  DocumentIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  BuildingStorefrontIcon,
  UserGroupIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

const AdminSidebar = ({ isOpen, onClose, user, variant = 'admin' }) => {
  const location = useLocation();
  console.log('AdminSidebar - Props:', { isOpen, user: user?.role });
  
  const [expandedSections, setExpandedSections] = useState({
    inventory: true,
    stock: false,
    sales: false,
    promo: false,
    purchases: false,
    finance: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const adminSections = [
    {
      title: 'Main',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
        { name: 'Super Admin', path: '/super-admin', icon: ShieldCheckIcon },
        { name: 'Applications', path: '/applications', icon: Squares2X2Icon },
        { name: 'Layouts', path: '/layouts', icon: RectangleStackIcon }
      ]
    },
    {
      title: 'Inventory',
      key: 'inventory',
      icon: CubeIcon,
      items: [
        { name: 'Products', path: '/products', icon: CubeTransparentIcon },
        { name: 'Create Product', path: '/products/create', icon: PlusIcon },
        { name: 'Expired Products', path: '/products/expired', icon: ExclamationTriangleIcon },
        { name: 'Low Stocks', path: '/products/low-stock', icon: ExclamationCircleIcon },
        { name: 'Category', path: '/categories', icon: TagIcon },
        { name: 'Sub Category', path: '/categories/sub', icon: CubeTransparentIcon },
        { name: 'Brands', path: '/brands', icon: SparklesIcon },
        { name: 'Units', path: '/units', icon: CubeIcon },
        { name: 'Variant Attributes', path: '/variants', icon: CubeTransparentIcon },
        { name: 'Warranties', path: '/warranties', icon: ShieldCheckIcon },
        { name: 'Print Barcode', path: '/print/barcode', icon: DocumentTextIcon },
        { name: 'Print QR Code', path: '/print/qr', icon: DocumentTextIcon }
      ]
    },
    {
      title: 'Stock',
      key: 'stock',
      icon: BuildingStorefrontIcon,
      items: [
        { name: 'Manage Stock', path: '/stock/manage', icon: CubeIcon },
        { name: 'Stock Adjustment', path: '/stock/adjustment', icon: ArrowPathIcon },
        { name: 'Stock Transfer', path: '/stock/transfer', icon: ArrowPathIcon }
      ]
    },
    {
      title: 'Sales',
      key: 'sales',
      icon: ShoppingCartIcon,
      items: [
        { name: 'Sales', path: '/sales', icon: ShoppingCartIcon },
        { name: 'Invoices', path: '/invoices', icon: DocumentIcon },
        { name: 'Sales Return', path: '/sales/returns', icon: ArrowUturnLeftIcon },
        { name: 'Quotation', path: '/quotations', icon: DocumentDuplicateIcon },
        { name: 'POS', path: '/pos', icon: BuildingStorefrontIcon }
      ]
    },
    {
      title: 'Promo',
      key: 'promo',
      icon: GiftIcon,
      items: [
        { name: 'Coupons', path: '/coupons', icon: ReceiptPercentIcon },
        { name: 'Gift Card', path: '/gift-cards', icon: GiftIcon },
        { name: 'Discount', path: '/discounts', icon: ReceiptPercentIcon }
      ]
    },
    {
      title: 'Purchases',
      key: 'purchases',
      icon: ClipboardDocumentListIcon,
      items: [
        { name: 'Purchases', path: '/purchases', icon: ClipboardDocumentListIcon },
        { name: 'Purchase Order', path: '/purchase-orders', icon: DocumentArrowDownIcon },
        { name: 'Purchase Return', path: '/purchase-returns', icon: ArrowUturnLeftIcon }
      ]
    },
    {
      title: 'Finance & Accounts',
      key: 'finance',
      icon: CurrencyDollarIcon,
      items: [
        { name: 'Expenses', path: '/expenses', icon: CurrencyDollarIcon },
        { name: 'Reports', path: '/reports', icon: ChartBarIcon },
        { name: 'Employees', path: '/admin/employees', icon: UserGroupIcon }
      ]
    }
  ];

  const cashierSections = [
    {
      title: 'Main',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
      ]
    },
    {
      title: 'Sales',
      key: 'sales',
      icon: ShoppingCartIcon,
      items: [
        { name: 'POS', path: '/pos', icon: BuildingStorefrontIcon },
        { name: 'Sales', path: '/sales', icon: ShoppingCartIcon },
      ]
    },
    {
      title: 'Inventory',
      key: 'inventory',
      icon: CubeIcon,
      items: [
        { name: 'Products', path: '/products', icon: CubeTransparentIcon },
        { name: 'Low Stocks', path: '/products/low-stock', icon: ExclamationCircleIcon },
      ]
    },
  ];

  const sidebarSections = variant === 'cashier' ? cashierSections : adminSections;

  const renderNavItem = (item, level = 0) => {
    const active = isActive(item.path);
    
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
          level === 1 ? 'ml-6' : ''
        } ${
          active
            ? 'bg-brand-yellow text-brand-black shadow-lg'
            : 'text-gray-300 hover:bg-black/40 hover:text-gray-100'
        }`}
      >
        <item.icon
          className={`mr-3 flex-shrink-0 h-5 w-5 transition-colors duration-200 ${
            active
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
    if (section.key) {
      const isExpanded = expandedSections[section.key];
      
      return (
        <div key={section.title} className="mb-2">
          <button
            onClick={() => toggleSection(section.key)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-black/40 rounded-xl transition-all duration-200 group"
          >
            <div className="flex items-center">
              <section.icon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-200" />
              <span>{section.title}</span>
            </div>
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4 text-gray-400 transition-transform duration-200" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-gray-400 transition-transform duration-200" />
            )}
          </button>
          
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}>
            <div className="py-2 space-y-1">
              {section.items.map(item => renderNavItem(item, 1))}
            </div>
          </div>
        </div>
      );
    } else {
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
    }
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
      <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-brand-gray border-r border-brand-yellow/20 shadow-2xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:fixed lg:w-80 lg:z-40 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-brand-yellow/20 bg-black">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-brand-yellow rounded-lg flex items-center justify-center mr-3">
                <BuildingStorefrontIcon className="h-5 w-5 text-brand-black" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-brand-yellow">Admin Panel</h1>
                <p className="text-xs text-gray-400">Business Management</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-lg text-gray-200 hover:bg:white/10 transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* User Info */}
          <div className="px-6 py-4 border-b border-brand-yellow/20 bg-brand-gray">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-brand-yellow rounded-full flex items-center justify-center mr-3">
                <span className="text-brand-black font-bold text-sm">
                  {user?.name?.charAt(0) || 'A'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-100">{user?.name || 'Admin'}</p>
                <p className="text-xs text-gray-400 capitalize">{user?.role || 'Administrator'}</p>
              </div>
            </div>
          </div>

          {/* Navigation (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto py-6 px-4">
            <nav className="space-y-2">
              {sidebarSections.map(renderSection)}
            </nav>
          </div>

          {/* Footer */}
          <div className="border-t border-brand-yellow/20 p-4 bg-brand-gray">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-400">
                <p>Version 2.1.0</p>
                <p>Last updated: Today</p>
              </div>
              <div className="flex space-x-2">
                <button className="p-2 text-gray-300 hover:text-gray-100 hover:bg-black/40 rounded-lg transition-colors">
                  <Cog6ToothIcon className="h-4 w-4" />
                </button>
                <button className="p-2 text-gray-300 hover:text-gray-100 hover:bg-black/40 rounded-lg transition-colors">
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminSidebar;


