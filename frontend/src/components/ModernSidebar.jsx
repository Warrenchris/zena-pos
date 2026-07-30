import React, { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  HomeIcon,
  UserGroupIcon,
  UserIcon,
  LightBulbIcon,
  PresentationChartLineIcon,
  CubeIcon,
  PlusIcon,
  TagIcon,
  FolderIcon,
  BuildingStorefrontIcon,
  ScaleIcon,
  SwatchIcon,
  ArchiveBoxIcon,
  ShoppingCartIcon,
  GiftIcon,
  CreditCardIcon,
  PercentBadgeIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
  BuildingStorefrontIcon as StoreIcon,
  CogIcon,
  BuildingOfficeIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ArrowUturnLeftIcon,
  DocumentIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const ModernSidebar = ({ isOpen, onClose, user, variant = 'admin' }) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState({});
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const sidebarLabelId = useId();

  // Mathematical 8pt spacing hierarchy navigation groups
  const menuSections = [
    {
      title: 'Sales & Orders',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
        { name: 'POS Terminal', path: '/pos', icon: ShoppingCartIcon },
        { name: 'Sales Orders', path: '/sales', icon: BanknotesIcon },
        { name: 'Invoices', path: '/invoices', icon: DocumentTextIcon },
        { name: 'Sales Returns', path: '/sales/returns', icon: ArrowUturnLeftIcon },
        { name: 'Quotations', path: '/quotations', icon: DocumentIcon },
      ]
    },
    {
      title: 'Inventory Catalog',
      items: [
        { name: 'Products', path: '/products', icon: CubeIcon },
        { name: 'Create Product', path: '/products/create', icon: PlusIcon },
        { name: 'Categories', path: '/categories', icon: TagIcon },
        { name: 'Sub Categories', path: '/categories/sub', icon: FolderIcon },
        { name: 'Brands', path: '/brands', icon: BuildingStorefrontIcon },
        { name: 'Units', path: '/units', icon: ScaleIcon },
        { name: 'Variants', path: '/variants', icon: SwatchIcon },
        { name: 'Stock Management', path: '/stock/manage', icon: ArchiveBoxIcon },
      ]
    },
    {
      title: 'Customers & Team',
      items: [
        { name: 'Customers', path: '/customers', icon: UserGroupIcon },
        { name: 'Employees', path: '/employees', icon: UserIcon },
      ]
    },
    {
      title: 'Finance & Operations',
      items: [
        { name: 'Purchases', path: '/purchases', icon: ShoppingBagIcon },
        { name: 'Purchase Orders', path: '/purchase-orders', icon: ClipboardDocumentListIcon },
        { name: 'Expenses', path: '/expenses', icon: CurrencyDollarIcon },
        { name: 'Coupons & Discounts', path: '/coupons', icon: GiftIcon },
      ]
    },
    {
      title: 'Analytics & Intelligence',
      items: [
        { name: 'Sales Forecasting', path: '/ai/forecasting', icon: ChartBarIcon },
        { name: 'Market Insights', path: '/ai/insights', icon: LightBulbIcon },
        { name: 'Financial Analysis', path: '/ai/finance', icon: PresentationChartLineIcon },
        { name: 'Reports', path: '/reports', icon: ChartBarIcon },
      ]
    },
    {
      title: 'Settings',
      items: [
        { name: 'Settings', path: '/settings', icon: CogIcon },
        { name: 'User Access', path: '/admin/users', icon: UserIcon },
        { name: 'Company Profile', path: '/admin/company', icon: BuildingOfficeIcon },
      ]
    }
  ];

  const cashierSections = [
    {
      title: 'Main',
      items: [
        { name: 'POS Terminal', path: '/dashboard', icon: ShoppingCartIcon },
        { name: 'My Sales', path: '/my-sales', icon: BanknotesIcon },
        { name: 'Products Catalog', path: '/products', icon: CubeIcon }
      ]
    },
    {
      title: 'Operations',
      items: [
        { name: 'Customers', path: '/customers', icon: UserGroupIcon },
        { name: 'Invoices', path: '/invoices', icon: DocumentTextIcon },
        { name: 'Sales Returns', path: '/sales/returns', icon: ArrowUturnLeftIcon }
      ]
    },
    {
      title: 'Account',
      items: [
        { name: 'Settings', path: '/settings', icon: CogIcon }
      ]
    }
  ];

  const sidebarSections = variant === 'admin' ? menuSections : cashierSections;

  const isActive = (path) => {
    return location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path + '/'));
  };

  const toggleSection = (sectionTitle) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionTitle]: !prev[sectionTitle]
    }));
  };

  useEffect(() => {
    const newExpandedSections = {};
    sidebarSections.forEach(section => {
      const hasActiveItem = section.items.some(item => isActive(item.path));
      if (hasActiveItem) {
        newExpandedSections[section.title] = true;
      }
    });
    if (Object.keys(newExpandedSections).length === 0 && sidebarSections.length > 0) {
      newExpandedSections[sidebarSections[0].title] = true;
    }
    setExpandedSections(newExpandedSections);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const renderNavItem = (item) => {
    const active = isActive(item.path);
    
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex items-center px-3 py-2 text-small rounded-lg transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          active
            ? 'bg-blue-50 text-blue-700 font-semibold border-l-2 border-primary pl-2.5 shadow-2xs'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary font-normal'
        }`}
      >
        <item.icon
          className={`mr-3 flex-shrink-0 h-4.5 w-4.5 transition-colors duration-150 ${
            active
              ? 'text-primary'
              : 'text-text-muted group-hover:text-text-secondary'
          }`}
        />
        <span className="truncate">{item.name}</span>
      </Link>
    );
  };

  const renderSection = (section) => {
    const isExpanded = expandedSections[section.title];
    
    return (
      <div key={section.title} className="mb-2.5">
        <button
          onClick={() => toggleSection(section.title)}
          className="flex items-center justify-between w-full px-3 py-1.5 text-caption font-semibold text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors duration-150 group rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-expanded={Boolean(isExpanded)}
          aria-controls={`sidebar-section-${section.title}`}
        >
          <span className="flex items-center">
            {section.title}
          </span>
          {isExpanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted transition-transform duration-200" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 text-text-muted transition-transform duration-200" />
          )}
        </button>
        
        <div
          id={`sidebar-section-${section.title}`}
          className={`overflow-hidden transition-all duration-200 ease-out ${
            isExpanded ? 'max-h-[800px] opacity-100 mt-1' : 'max-h-0 opacity-0'
          }`}
          role="group"
          aria-hidden={!isExpanded}
        >
          <div className="space-y-0.5 pl-1">
            {section.items.map(item => renderNavItem(item))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div 
        className={`fixed inset-0 bg-slate-900/20 backdrop-blur-xs transition-opacity duration-200 ease-out lg:hidden ${
          isOpen ? 'opacity-100 z-40' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      {/* Floating Card Sidebar Shell */}
      <div
        className={`fixed top-4 bottom-4 left-4 z-40 w-64 lg:w-64 2xl:w-72 bg-white border border-border-default shadow-floating rounded-2xl transform transition-all duration-200 ease-out flex flex-col overflow-hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-[calc(100%+16px)] lg:translate-x-0'
        }`}
        role="navigation"
        aria-labelledby={sidebarLabelId}
        aria-hidden={!isOpen && !isDesktop}
      >
        {/* Sidebar Header with Brand */}
        <div className="flex items-center justify-between h-14 px-5 border-b border-border-default bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center text-primary shrink-0 shadow-2xs">
              <StoreIcon className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 id={sidebarLabelId} className="text-body font-semibold text-text-primary tracking-tight">
                {variant === 'admin' ? 'Zana Suite' : 'Zana POS'}
              </h1>
              <p className="text-caption text-text-muted font-normal">
                {variant === 'admin' ? 'Enterprise' : 'Terminal'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Close navigation menu"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Groups Container */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3 space-y-2">
          <nav aria-label="Primary navigation">
            {sidebarSections.map(renderSection)}
          </nav>
        </div>

        {/* Floating User / Profile Footer */}
        <div className="p-3.5 border-t border-border-default bg-surface-2/40">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary text-white font-semibold text-caption flex items-center justify-center shadow-2xs">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
            <div className="ml-2.5 flex-1 min-w-0">
              <p className="text-small font-medium text-text-primary truncate">{user?.name || 'User'}</p>
              <p className="text-caption text-text-muted truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ModernSidebar;
