import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon,
  UserGroupIcon,
  UserIcon,
  LightBulbIcon,
  PresentationChartLineIcon,
  CubeIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  TagIcon,
  FolderIcon,
  BuildingStorefrontIcon,
  ScaleIcon,
  SwatchIcon,
  ShieldCheckIcon,
  QrCodeIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
  TruckIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ArrowUturnLeftIcon,
  DocumentIcon,
  ShoppingCartIcon,
  GiftIcon,
  CreditCardIcon,
  PercentBadgeIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ArrowDownTrayIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
  BuildingStorefrontIcon as StoreIcon
} from '@heroicons/react/24/outline';

const ModernSidebar = ({ isOpen, onClose, user, variant = 'admin' }) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState({});
  const [hoveredItem, setHoveredItem] = useState(null);

  // Define menu structure
  const menuSections = [
    {
      title: 'Main',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
        { name: 'POS', path: '/pos', icon: ShoppingCartIcon },
        { name: 'Sales', path: '/sales', icon: BanknotesIcon },
        { name: 'Products', path: '/products', icon: CubeIcon }
      ]
    },
    {
      title: 'People',
      items: [
        { name: 'Customers', path: '/customers', icon: UserGroupIcon },
        { name: 'Employees', path: '/employees', icon: UserIcon },
      ]
    },
    {
      title: 'AI & Analytics',
      items: [
        { name: 'Sales Forecasting', path: '/ai/forecasting', icon: ChartBarIcon },
        { name: 'Market Insights', path: '/ai/insights', icon: LightBulbIcon },
        { name: 'Financial Analysis', path: '/ai/finance', icon: PresentationChartLineIcon },
      ]
    },
    {
      title: 'Inventory',
      items: [
        { name: 'Products', path: '/products', icon: CubeIcon },
        { name: 'Create Product', path: '/products/create', icon: PlusIcon },
        { name: 'Expired Products', path: '/products/expired', icon: ExclamationTriangleIcon },
        { name: 'Low Stocks', path: '/products/low-stock', icon: ChartBarIcon },
        { name: 'Category', path: '/categories', icon: TagIcon },
        { name: 'Sub Category', path: '/categories/sub', icon: FolderIcon },
        { name: 'Brands', path: '/brands', icon: BuildingStorefrontIcon },
        { name: 'Units', path: '/units', icon: ScaleIcon },
        { name: 'Variant Attributes', path: '/variants', icon: SwatchIcon },
        { name: 'Warranties', path: '/warranties', icon: ShieldCheckIcon },
        { name: 'Print Barcode', path: '/print/barcode', icon: QrCodeIcon },
        { name: 'Print QR Code', path: '/print/qr', icon: QrCodeIcon }
      ]
    },
    {
      title: 'Stock',
      items: [
        { name: 'Manage Stock', path: '/stock/manage', icon: ArchiveBoxIcon },
        { name: 'Stock Adjustment', path: '/stock/adjustment', icon: ArrowPathIcon },
        { name: 'Stock Transfer', path: '/stock/transfer', icon: TruckIcon }
      ]
    },
    {
      title: 'Sales',
      items: [
        { name: 'Sales', path: '/sales', icon: BanknotesIcon },
        { name: 'Invoices', path: '/invoices', icon: DocumentTextIcon },
        { name: 'Sales Return', path: '/sales/returns', icon: ArrowUturnLeftIcon },
        { name: 'Quotation', path: '/quotations', icon: DocumentIcon },
        { name: 'POS', path: '/pos', icon: ShoppingCartIcon }
      ]
    },
    {
      title: 'Promo',
      items: [
        { name: 'Coupons', path: '/coupons', icon: GiftIcon },
        { name: 'Gift Card', path: '/gift-cards', icon: CreditCardIcon },
        { name: 'Discount', path: '/discounts', icon: PercentBadgeIcon }
      ]
    },
    {
      title: 'Purchases',
      items: [
        { name: 'Purchases', path: '/purchases', icon: ShoppingBagIcon },
        { name: 'Purchase Order', path: '/purchase-orders', icon: ClipboardDocumentListIcon },
        { name: 'Purchase Return', path: '/purchase-returns', icon: ArrowDownTrayIcon }
      ]
    },
    {
      title: 'Finance & Accounts',
      items: [
        { name: 'Expenses', path: '/expenses', icon: CurrencyDollarIcon }
      ]
    }
  ];

  // Cashier-specific sections (simplified)
  const cashierSections = [
    {
      title: 'Main',
      items: [
        { name: 'POS', path: '/dashboard', icon: ShoppingCartIcon },
        { name: 'My Sales', path: '/sales', icon: BanknotesIcon },
        { name: 'Products', path: '/products/view', icon: CubeIcon }
      ]
    }
  ];

  const sidebarSections = variant === 'admin' ? menuSections : cashierSections;

  // Check if a path is active
  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Toggle section expansion
  const toggleSection = (sectionTitle) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionTitle]: !prev[sectionTitle]
    }));
  };

  // Auto-expand sections with active items
  useEffect(() => {
    const newExpandedSections = {};
    sidebarSections.forEach(section => {
      const hasActiveItem = section.items.some(item => isActive(item.path));
      if (hasActiveItem) {
        newExpandedSections[section.title] = true;
      }
    });
    setExpandedSections(newExpandedSections);
  }, [location.pathname]);

  const renderNavItem = (item) => {
    const active = isActive(item.path);
    const isHovered = hoveredItem === item.path;
    
    return (
      <Link
        key={item.path}
        to={item.path}
        className={`group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
          active
            ? 'bg-gradient-to-r from-brand-yellow to-yellow-400 text-brand-black shadow-lg transform scale-[1.02]'
            : 'text-gray-300 hover:bg-gray-800/50 hover:text-white hover:transform hover:scale-[1.01]'
        }`}
        onMouseEnter={() => setHoveredItem(item.path)}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <item.icon
          className={`mr-3 flex-shrink-0 h-5 w-5 transition-all duration-200 ${
            active || isHovered
              ? 'text-brand-black scale-110'
              : 'text-gray-400 group-hover:text-white group-hover:scale-105'
          }`}
        />
        <span className="truncate font-medium">{item.name}</span>
        {active && (
          <div className="ml-auto w-2 h-2 bg-brand-black rounded-full opacity-80 animate-pulse"></div>
        )}
      </Link>
    );
  };

  const renderSection = (section) => {
    const isExpanded = expandedSections[section.title];
    
    return (
      <div key={section.title} className="mb-6">
        <button
          onClick={() => toggleSection(section.title)}
          className="flex items-center justify-between w-full px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors duration-200 group"
        >
          <span className="flex items-center">
            <span className="w-1 h-4 bg-brand-yellow rounded-full mr-3 group-hover:bg-yellow-400 transition-colors duration-200"></span>
            {section.title}
          </span>
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 transition-transform duration-200" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 transition-transform duration-200" />
          )}
        </button>
        
        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="space-y-1 pl-4 mt-2">
            {section.items.map(item => renderNavItem(item))}
          </div>
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
      <div className={`fixed inset-y-0 left-0 z-30 w-80 bg-gradient-to-b from-brand-black via-black to-brand-black backdrop-blur-sm border-r border-brand-yellow/20 shadow-2xl transform transition-all duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="flex h-full flex-col">
          {/* Header with Logo */}
          <div className="flex items-center justify-between h-20 px-6 border-b border-brand-yellow/20 bg-gradient-to-r from-brand-black to-black backdrop-blur-sm">
            <div className="flex items-center justify-center w-full">
              <div className="w-12 h-12 bg-gradient-to-tr from-brand-yellow to-yellow-400 rounded-xl flex items-center justify-center shadow-lg transform transition-transform duration-300 hover:scale-105">
                <StoreIcon className="h-7 w-7 text-brand-black" />
              </div>
              <div className="ml-4">
                <h1 className="text-xl font-bold bg-gradient-to-r from-brand-yellow to-yellow-400 bg-clip-text text-transparent">
                  {variant === 'admin' ? 'Admin Panel' : 'Cashier Panel'}
                </h1>
                <p className="text-xs text-gray-400 font-medium">
                  {variant === 'admin' ? 'Business Management' : 'Point of Sale'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-lg text-gray-200 hover:text-white hover:bg-gray-700 transition-colors duration-200"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation Items */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 mt-16">
            <nav className="px-4 py-6 space-y-6">
              {sidebarSections.map(renderSection)}
            </nav>
          </div>

          {/* User Info */}
          <div className="p-4 border-t border-brand-yellow/20 bg-gradient-to-r from-gray-800 to-gray-900">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-brand-yellow to-yellow-400 flex items-center justify-center shadow-lg">
                  <span className="text-brand-black font-bold text-lg">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-200 truncate">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                <div className="flex items-center mt-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                  <span className="text-xs text-gray-400">Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ModernSidebar;
