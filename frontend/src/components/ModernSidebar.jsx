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
  ChartBarIcon,
  ChevronLeftIcon,
  ChevronRightIcon as CollapseRightIcon
} from '@heroicons/react/24/outline';

const ModernSidebar = ({
  isOpen,
  onClose,
  user,
  variant = 'admin',
  isCollapsed = false,
  onToggleCollapse
}) => {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState({});
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : false
  );
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const sidebarLabelId = useId();

  // Navigation Groups Structure
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

    if (isCollapsed && isDesktop) {
      return (
        <div key={item.path} className="relative group/tooltip flex justify-center my-1">
          <Link
            to={item.path}
            aria-current={active ? 'page' : undefined}
            onMouseEnter={() => setHoveredTooltip(item.name)}
            onMouseLeave={() => setHoveredTooltip(null)}
            className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              active
                ? 'bg-primary text-white shadow-md'
                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            }`}
          >
            <item.icon className="h-5 w-5 shrink-0" />
          </Link>

          {/* Floating Hover Tooltip for Collapsed Mode */}
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-150">
            <div className="bg-text-primary text-surface text-caption font-semibold px-3 py-1.5 rounded-lg shadow-floating whitespace-nowrap flex items-center gap-1.5">
              <span>{item.name}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex items-center px-3 py-2 text-small rounded-xl transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          active
            ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary pl-2.5 shadow-2xs'
            : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary font-normal'
        }`}
      >
        <item.icon
          className={`mr-3 shrink-0 h-5 w-5 transition-colors duration-150 ${
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

    if (isCollapsed && isDesktop) {
      return (
        <div key={section.title} className="py-2 border-b border-border-default/50 last:border-b-0">
          <div className="space-y-1">
            {section.items.map(item => renderNavItem(item))}
          </div>
        </div>
      );
    }

    return (
      <div key={section.title} className="mb-2.5">
        <button
          onClick={() => toggleSection(section.title)}
          className="flex items-center justify-between w-full px-3 py-1.5 text-caption font-semibold text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors duration-150 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-expanded={Boolean(isExpanded)}
          aria-controls={`sidebar-section-${section.title}`}
        >
          <span className="flex items-center">
            {section.title}
          </span>
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-text-muted transition-transform duration-200" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-text-muted transition-transform duration-200" />
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

  const sidebarWidthClass = isCollapsed && isDesktop ? 'w-20' : 'w-64 lg:w-64 2xl:w-72';

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div 
        className={`fixed inset-0 bg-stone-950/40 backdrop-blur-xs transition-opacity duration-200 ease-out lg:hidden ${
          isOpen ? 'opacity-100 z-40' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      {/* Floating Card Sidebar Shell */}
      <div
        className={`fixed top-4 bottom-4 left-4 z-40 ${sidebarWidthClass} bg-surface border border-border-default shadow-floating rounded-2xl transform transition-all duration-200 ease-out flex flex-col overflow-hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-[calc(100%+16px)] lg:translate-x-0'
        }`}
        role="navigation"
        aria-labelledby={sidebarLabelId}
        aria-hidden={!isOpen && !isDesktop}
      >
        {/* Sidebar Header with Brand & Desktop Collapse Toggle */}
        <div className={`flex items-center justify-between h-14 border-b border-border-default bg-surface ${isCollapsed && isDesktop ? 'px-3 justify-center' : 'px-4'}`}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center text-primary shrink-0 shadow-2xs">
              <StoreIcon className="h-5 w-5" />
            </div>
            {(!isCollapsed || !isDesktop) && (
              <div className="truncate">
                <h1 id={sidebarLabelId} className="text-body font-bold text-text-primary tracking-tight truncate">
                  {variant === 'admin' ? 'Zana Suite' : 'Zana POS'}
                </h1>
                <p className="text-caption text-text-muted font-medium truncate">
                  {variant === 'admin' ? 'Enterprise' : 'Terminal'}
                </p>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label="Toggle sidebar collapse"
          >
            {isCollapsed ? (
              <CollapseRightIcon className="h-4 w-4" />
            ) : (
              <ChevronLeftIcon className="h-4 w-4" />
            )}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40"
            aria-label="Close navigation menu"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Groups Container */}
        <div className={`flex-1 overflow-y-auto scrollbar-thin space-y-2 ${isCollapsed && isDesktop ? 'px-2 py-3' : 'px-3 py-3'}`}>
          <nav aria-label="Primary navigation">
            {sidebarSections.map(renderSection)}
          </nav>
        </div>

        {/* Floating User Profile / Utility Footer */}
        <div className={`border-t border-border-default bg-surface-2/40 ${isCollapsed && isDesktop ? 'p-2.5 flex justify-center' : 'p-3.5'}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-primary text-white font-bold text-caption flex items-center justify-center shadow-2xs">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
            </div>
            {(!isCollapsed || !isDesktop) && (
              <div className="flex-1 min-w-0">
                <p className="text-small font-semibold text-text-primary truncate">{user?.name || 'User'}</p>
                <p className="text-caption text-text-muted truncate">{user?.email}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ModernSidebar;
