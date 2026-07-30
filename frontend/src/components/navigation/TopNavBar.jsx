import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import {
  BuildingStorefrontIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  ArrowRightOnRectangleIcon,
  UserIcon,
  SunIcon,
  MoonIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import { fetchMyShop } from '../../store/slices/shopSlice';
import { logout } from '../../store/slices/authSlice';
import NotificationDropdown from '../NotificationDropdown';
import { useTheme } from '../../providers/ThemeProvider';

const TopNavBar = ({ onMenuClick, className = '', isSidebarOpen }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();

  const user = useSelector((state) => state.auth?.user);
  const authShop = useSelector((state) => state.auth?.shop);
  const { shop, loading } = useSelector((state) => state.shop || {});

  const currentShop = shop || authShop || (user?.shop ? { name: user.shop.name } : null);
  const hasFetchedShopRef = useRef(false);

  useEffect(() => {
    if (hasFetchedShopRef.current) return;
    if (user && !authShop && !shop && !loading) {
      hasFetchedShopRef.current = true;
      dispatch(fetchMyShop());
    }
  }, [dispatch, authShop, shop, loading, user]);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <header className={`sticky top-4 z-30 px-4 sm:px-6 mb-6 ${className}`}>
      <div className="mx-auto max-w-[1440px] bg-surface border border-border-default shadow-floating rounded-2xl h-14 px-4 flex items-center justify-between gap-4 transition-colors duration-200">
        
        {/* Left Side: Mobile Menu Toggle & Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="lg:hidden p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            onClick={() => onMenuClick && onMenuClick()}
            aria-label="Open navigation menu"
            aria-expanded={Boolean(isSidebarOpen)}
          >
            <Squares2X2Icon className="h-5 w-5" />
          </button>

          <Link to="/" className="flex items-center gap-2.5 lg:hidden">
            <div className="w-8 h-8 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-center text-primary shadow-2xs">
              <BuildingStorefrontIcon className="h-4 w-4" />
            </div>
            <span className="text-body font-bold text-text-primary tracking-tight">
              Zana POS
            </span>
          </Link>
        </div>

        {/* Center: Global Search Bar */}
        <div className="hidden lg:flex flex-1 max-w-lg items-center">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center">
              <MagnifyingGlassIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
            </div>
            <label htmlFor="global-search" className="sr-only">Search</label>
            <input
              id="global-search"
              type="search"
              placeholder="Search products, sales, customers (Press ⌘K)..."
              className="block w-full rounded-xl border border-border-default bg-surface-2/50 py-2 pl-10 pr-12 text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary focus:bg-surface transition-all duration-150"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              <kbd className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono text-text-muted bg-surface border border-border-default rounded-md shadow-2xs">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>

        {/* Right Side Actions — Baseline Aligned Height */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* Store / Workspace Switcher */}
          <div className="hidden sm:block relative">
            <Menu as="div" className="relative">
              <Menu.Button className="h-9 flex items-center gap-2 px-3 border border-border-default rounded-xl bg-surface hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-text-primary transition-all duration-150 text-small font-medium shadow-2xs">
                <BuildingStorefrontIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="max-w-[120px] truncate font-medium">
                  {loading ? 'Loading...' : currentShop?.name || 'My Store'}
                </span>
                <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
              </Menu.Button>
              <Transition
                enter="transition duration-150 ease-out"
                enterFrom="transform scale-95 opacity-0"
                enterTo="transform scale-100 opacity-100"
                leave="transition duration-100 ease-in"
                leaveFrom="transform scale-100 opacity-100"
                leaveTo="transform scale-95 opacity-0"
              >
                <Menu.Items className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl bg-surface border border-border-default shadow-modal p-1.5 z-50 focus:outline-none">
                  <div className="px-3.5 py-2.5 border-b border-border-default mb-1">
                    <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Current Workspace</p>
                    <p className="text-small font-semibold text-text-primary mt-0.5">{currentShop?.name || 'Default Store'}</p>
                  </div>
                  <Menu.Item>
                    {({ active }) => (
                      <button className={`w-full text-left px-3 py-2 text-small rounded-xl flex items-center gap-2.5 ${active ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`}>
                        <BuildingStorefrontIcon className="h-4 w-4 text-primary" />
                        <span>Manage Workspaces</span>
                      </button>
                    )}
                  </Menu.Item>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>

          {/* Quick POS Terminal Button */}
          <Link
            to="/pos"
            className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-small font-semibold text-white bg-primary hover:bg-primary-hover active:bg-primary-active shadow-sm transition-all duration-150"
          >
            <ShoppingCartIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xs:inline">POS Terminal</span>
          </Link>

          {/* Light / Dark Mode Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-text-secondary hover:text-text-primary transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-2xs"
            title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <SunIcon className="h-4 w-4 text-amber-400 transition-transform duration-200 rotate-0 hover:rotate-45" />
            ) : (
              <MoonIcon className="h-4 w-4 text-text-secondary transition-transform duration-200 rotate-0 hover:-rotate-12" />
            )}
          </button>

          {/* Notifications Dropdown */}
          <NotificationDropdown />

          {/* User Profile Menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="h-9 flex items-center gap-2 px-2 border border-border-default rounded-xl bg-surface hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors shadow-2xs">
              <div className="w-6 h-6 rounded-lg bg-primary text-white font-semibold text-caption flex items-center justify-center shadow-2xs">
                {user?.name?.[0]?.toUpperCase() || 'U'}
              </div>
              <ChevronDownIcon className="h-3.5 w-3.5 text-text-muted hidden sm:block" />
            </Menu.Button>

            <Transition
              enter="transition duration-150 ease-out"
              enterFrom="transform scale-95 opacity-0"
              enterTo="transform scale-100 opacity-100"
              leave="transition duration-100 ease-in"
              leaveFrom="transform scale-100 opacity-100"
              leaveTo="transform scale-95 opacity-0"
            >
              <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-2xl bg-surface border border-border-default shadow-modal p-1.5 z-50 focus:outline-none">
                <div className="px-3.5 py-2.5 border-b border-border-default mb-1">
                  <p className="text-small font-semibold text-text-primary">{user?.name || 'User'}</p>
                  <p className="text-caption text-text-muted truncate">{user?.email}</p>
                </div>
                <Menu.Item>
                  {({ active }) => (
                    <Link to="/settings" className={`flex items-center gap-2.5 px-3 py-2 text-small rounded-xl ${active ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`}>
                      <UserIcon className="h-4 w-4 text-text-muted" />
                      Profile & Settings
                    </Link>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button onClick={handleLogout} className={`w-full flex items-center gap-2.5 px-3 py-2 text-small rounded-xl text-danger font-medium ${active ? 'bg-danger/10' : ''}`}>
                      <ArrowRightOnRectangleIcon className="h-4 w-4" />
                      Sign Out
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>

        </div>
      </div>
    </header>
  );
};

export default TopNavBar;