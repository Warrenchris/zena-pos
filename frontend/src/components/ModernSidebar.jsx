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
  BuildingStorefrontIcon as StoreIcon,
  CogIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';

const ModernSidebar = ({ isOpen, onClose, user, variant = 'admin' }) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState({});
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const sidebarLabelId = useId();

  // Navigation Groups structure
  const menuSections = [
    {
      title: 'Sales',
      items: [
        { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
        { name: 'POS', path: '/pos', icon: ShoppingCartIcon },
        { name: 'Sales Orders', path: '/sales', icon: BanknotesIcon },
        { name: 'Invoices', path: '/invoices', icon: DocumentTextIcon },
        { name: 'Sales Return', path: '/sales/returns', icon: ArrowUturnLeftIcon },
        { name: 'Quotations', path: '/quotations', icon: DocumentIcon },
      ]
    },
    {
      title: 'Inventory',
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
      title: 'People & Customers',
      items: [
        { name: 'Customers', path: '/customers', icon: UserGroupIcon },
        { name: 'Employees', path: '/employees', icon: UserIcon },
      ]
    },
    {
      title: 'Promotions & Purchasing',
      items: [
        { name: 'Coupons', path: '/coupons', icon: GiftIcon },
        { name: 'Gift Cards', path: '/gift-cards', icon: CreditCardIcon },
        { name: 'Discounts', path: '/discounts', icon: PercentBadgeIcon },
        { name: 'Purchases', path: '/purchases', icon: ShoppingBagIcon },
        { name: 'Purchase Orders', path: '/purchase-orders', icon: ClipboardDocumentListIcon },
        { name: 'Expenses', path: '/expenses', icon: CurrencyDollarIcon },
      ]
    },
    {
      title: 'AI & Analytics',
      items: [
        { name: 'Sales Forecasting', path: '/ai/forecasting', icon: ChartBarIcon },
        { name: 'Market Insights', path: '/ai/insights', icon: LightBulbIcon },
        { name: 'Financial Analysis', path: '/ai/finance', icon: PresentationChartLineIcon },
        { name: 'Reports', path: '/reports', icon: ChartBarIcon },
      ]
    },
    {
      title: 'Administration',
      items: [
        { name: 'Settings', path: '/settings', icon: CogIcon },
        { name: 'Users', path: '/admin/users', icon: UserIcon },
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
    // Ensure first group default open if none matched
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
        className={`group relative flex items-center px-3.5 py-2.5 text-small rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          active
            ? 'bg-amber-50 text-amber-900 font-semibold border-l-4 border-primary pl-2.5 shadow-sm'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary font-medium'
        }`}
      >
        <item.icon
          className={`mr-3 flex-shrink-0 h-5 w-5 transition-colors duration-150 ${
            active
              ? 'text-primary font-bold'
              : 'text-text-muted group-hover:text-text-primary'
          }`}
        />
        <span className="truncate">{item.name}</span>
      </Link>
    );
  };

  const renderSection = (section) => {
    const isExpanded = expandedSections[section.title];
    
    return (
      <div key={section.title} className="mb-3">
        <button
          onClick={() => toggleSection(section.title)}
          className="flex items-center justify-between w-full px-3 py-2 text-caption font-semibold text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors duration-150 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
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
            isExpanded ? 'max-h-[1000px] opacity-100 mt-1' : 'max-h-0 opacity-0'
          }`}
          role="group"
          aria-hidden={!isExpanded}
        >
          <div className="space-y-1 pl-1">
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
        className={`fixed inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-200 ease-out lg:hidden ${
          isOpen ? 'opacity-100 z-40' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      {/* Floating Card Sidebar Shell */}
      <div
        className={`fixed top-4 bottom-4 left-4 z-40 w-72 lg:w-72 2xl:w-80 bg-white border border-border-default shadow-floating rounded-2xl transform transition-all duration-200 ease-out flex flex-col overflow-hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-[calc(100%+16px)] lg:translate-x-0'
        }`}
        role="navigation"
        aria-labelledby={sidebarLabelId}
        aria-hidden={!isOpen && !isDesktop}
      >
        {/* Sidebar Header with Brand */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-border-default bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center text-primary shrink-0 shadow-sm">
              <StoreIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 id={sidebarLabelId} className="text-body font-bold text-text-primary tracking-tight">
                {variant === 'admin' ? 'Zana Admin' : 'Zana POS'}
              </h1>
              <p className="text-caption text-text-muted font-normal">
                {variant === 'admin' ? 'Business Suite' : 'Cashier Terminal'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Close navigation menu"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Groups Container */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
          <nav aria-label="Primary navigation">
            {sidebarSections.map(renderSection)}
          </nav>
        </div>

        {/* Floating User / Profile Footer */}
        <div className="p-4 border-t border-border-default bg-surface-2/60">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-primary text-white font-semibold text-small flex items-center justify-center shadow-sm">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-small font-semibold text-text-primary truncate">{user?.name || 'User'}</p>
              <p className="text-caption text-text-muted truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ModernSidebar;
