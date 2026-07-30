import React, { useEffect, useRef, useState } from 'react';
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
} from '@heroicons/react/24/outline';
import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import { fetchMyShop } from '../../store/slices/shopSlice';
import { logout } from '../../store/slices/authSlice';
import NotificationDropdown from '../NotificationDropdown';

const TopNavBar = ({ onMenuClick, className = '', isSidebarOpen }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

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
      <div className="mx-auto max-w-[1440px] bg-white border border-border-default shadow-sm rounded-xl h-12 px-3.5 flex items-center justify-between gap-4">
        
        {/* Left Side: Mobile Menu Toggle & Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="lg:hidden p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 mobile-nav-trigger"
            onClick={() => onMenuClick && onMenuClick()}
            aria-label="Open navigation menu"
            aria-expanded={Boolean(isSidebarOpen)}
          >
            <Squares2X2Icon className="h-5 w-5" />
          </button>

          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <div className="w-7 h-7 bg-blue-50 border border-blue-100 rounded-md flex items-center justify-center text-primary">
              <BuildingStorefrontIcon className="h-4 w-4" />
            </div>
            <span className="text-body font-bold text-text-primary">
              Zana POS
            </span>
          </Link>
        </div>

        {/* Center: Global Search Bar */}
        <div className="hidden lg:flex flex-1 max-w-lg items-center">
          <div className="relative w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
              <MagnifyingGlassIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
            </div>
            <label htmlFor="global-search" className="sr-only">Search</label>
            <input
              id="global-search"
              type="search"
              placeholder="Search products, orders, or customers (Press '/' to focus)..."
              className="block w-full rounded-lg border border-border-default bg-surface-0 py-1.5 pl-9 pr-3 text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors duration-150"
            />
          </div>
        </div>

        {/* Right Side Actions — All 36px Baseline Height Aligned */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* Store Switcher */}
          <div className="hidden sm:block relative">
            <Menu as="div" className="relative">
              <Menu.Button className="h-9 flex items-center gap-2 px-3 border border-border-default rounded-lg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 text-text-primary transition-colors text-small font-medium">
                <BuildingStorefrontIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="max-w-[120px] truncate">
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
                <Menu.Items className="absolute right-0 mt-2 w-60 origin-top-right rounded-xl bg-white border border-border-default shadow-floating p-1.5 z-50 focus:outline-none">
                  <div className="px-3 py-2 border-b border-border-default mb-1">
                    <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Current Workspace</p>
                    <p className="text-small font-semibold text-text-primary mt-0.5">{currentShop?.name || 'Default Store'}</p>
                  </div>
                  <Menu.Item>
                    {({ active }) => (
                      <button className={`w-full text-left px-3 py-1.5 text-small rounded-md flex items-center gap-2 ${active ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`}>
                        <BuildingStorefrontIcon className="h-4 w-4 text-primary" />
                        <span>Manage Stores</span>
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
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg text-small font-semibold text-white bg-primary hover:bg-primary-hover active:bg-primary-active shadow-2xs transition-colors duration-150"
          >
            <ShoppingCartIcon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xs:inline">POS</span>
          </Link>

          {/* Notifications Dropdown */}
          <NotificationDropdown />

          {/* User Profile Menu */}
          <Menu as="div" className="relative">
            <Menu.Button className="h-9 flex items-center gap-1.5 px-1.5 rounded-lg hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors">
              <div className="w-7 h-7 rounded-full bg-primary text-white font-semibold text-caption flex items-center justify-center shadow-2xs">
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
              <Menu.Items className="absolute right-0 mt-2 w-52 origin-top-right rounded-xl bg-white border border-border-default shadow-floating p-1.5 z-50 focus:outline-none">
                <div className="px-3 py-2 border-b border-border-default mb-1">
                  <p className="text-small font-semibold text-text-primary">{user?.name}</p>
                  <p className="text-caption text-text-muted truncate">{user?.email}</p>
                </div>
                <Menu.Item>
                  {({ active }) => (
                    <Link to="/settings" className={`flex items-center gap-2 px-3 py-1.5 text-small rounded-md ${active ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`}>
                      <UserIcon className="h-4 w-4" />
                      Profile Settings
                    </Link>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button onClick={handleLogout} className={`w-full flex items-center gap-2 px-3 py-1.5 text-small rounded-md text-danger ${active ? 'bg-danger/10' : ''}`}>
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