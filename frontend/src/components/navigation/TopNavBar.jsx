import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import {
  BuildingStorefrontIcon,
  ChatBubbleLeftIcon,
  ChevronDownIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { ShoppingCartIcon } from '@heroicons/react/24/solid';
import { fetchMyShop } from '../../store/slices/shopSlice';
import { logout } from '../../store/slices/authSlice';
import NotificationDropdown from '../NotificationDropdown';

const TopNavBar = ({ onMenuClick, className = '', isSidebarOpen }) => {
  const withTrustedClick = (handler) => (event, ...rest) => {
    if (event && event.nativeEvent && event.nativeEvent.isTrusted === false) return;
    return handler(event, ...rest);
  };

  const dispatch = useDispatch();
  const [isStoreMenuOpen, setIsStoreMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  const user = useSelector((state) => state.auth?.user);
  const authShop = useSelector((state) => state.auth?.shop);
  const { shop, loading, error: stateError } = useSelector((state) => state.shop || {});

  const currentShop = shop || authShop || (user?.shop ? { name: user.shop.name } : null);
  const navigate = useNavigate();
  const hasFetchedShopRef = useRef(false);

  useEffect(() => {
    if (hasFetchedShopRef.current) return;
    if (user && !authShop && !shop && !loading) {
      hasFetchedShopRef.current = true;
      dispatch(fetchMyShop());
    }
  }, [dispatch, authShop, shop, loading, user]);

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'sw', name: 'Swahili', flag: '🇰🇪' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
  ];

  const handleLogout = () => {
    dispatch(logout());
    setIsProfileMenuOpen(false);
    navigate('/login');
  };

  const navClasses = `bg-brand-gray/95 backdrop-blur border-b border-brand-yellow/20 ${className}`.trim();

  return (
    <nav className={navClasses}>
      <div className="app-shell app-shell--wide">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center flex-shrink-0 gap-3">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg text-gray-200 hover:bg-black/40 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray mobile-nav-trigger"
              onClick={withTrustedClick(() => onMenuClick && onMenuClick())}
              aria-label="Open menu"
              aria-expanded={Boolean(isSidebarOpen)}
            >
              <Squares2X2Icon className="h-6 w-6" />
            </button>
            <Link to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-brand-yellow rounded-lg flex items-center justify-center">
                <BuildingStorefrontIcon className="h-5 w-5 text-brand-black" />
              </div>
              <span className="text-xl font-bold text-brand-yellow">
                Zana POS
              </span>
            </Link>
          </div>

          <div className="hidden flex-1 items-center justify-center gap-4 lg:flex">
            <div className="relative flex-1 max-w-2xl">
              <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
              </div>
              <label htmlFor="global-search" className="sr-only">Search</label>
              <input
                id="global-search"
                type="search"
                placeholder="Search products, orders, or customers..."
                className="block w-full pl-10 pr-3 py-2 border border-brand-yellow/20 rounded-lg bg-brand-black text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
              />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={withTrustedClick(() => setIsStoreMenuOpen(!isStoreMenuOpen))}
                className="flex items-center gap-2 px-4 py-2 border border-brand-yellow/30 rounded-lg hover:bg-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow text-gray-100"
                disabled={loading}
                aria-haspopup="true"
                aria-expanded={isStoreMenuOpen}
              >
                <BuildingStorefrontIcon className="h-5 w-5 text-brand-yellow" aria-hidden="true" />
                <span className="text-sm font-medium">
                  {loading ? 'Loading...' : currentShop?.name || 'Your Shop'}
                </span>
                <ChevronDownIcon className="h-4 w-4 text-gray-300" aria-hidden="true" />
              </button>

              {isStoreMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-brand-gray border border-brand-yellow/20 rounded-lg shadow-xl py-1 z-50" role="menu">
                  {stateError ? (
                    <div className="px-4 py-2 text-sm text-red-400">{stateError.message || 'Failed to load shop'}</div>
                  ) : loading ? (
                    <div className="px-4 py-2 text-sm text-gray-300">Loading shop...</div>
                  ) : currentShop ? (
                    <div className="px-4 py-2">
                      <p className="text-sm font-medium text-gray-100">{currentShop.name}</p>
                      {currentShop.address && (
                        <p className="text-xs text-gray-400">{currentShop.address}</p>
                      )}
                    </div>
                  ) : (
                    <div className="p-4">
                      <p className="text-sm text-gray-300 mb-1">{user?.role === 'admin' ? 'No shop set yet.' : 'Contact admin for shop access.'}</p>
                      <p className="text-xs text-gray-400">Ask an admin to create your company shop.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center justify-center rounded-lg p-2 text-gray-200 hover:text-white hover:bg-black/30 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray mobile-nav-trigger lg:hidden"
              onClick={() => setIsMobileSearchOpen(true)}
              aria-label="Open search"
            >
              <MagnifyingGlassIcon className="h-6 w-6" aria-hidden="true" />
            </button>

            <button type="button" className="inline-flex items-center gap-2 px-4 py-2 border border-brand-yellow/40 rounded-lg text-sm font-medium text-brand-black bg-brand-yellow hover:bg-brand-yellowDark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-yellow focus:ring-offset-brand-gray">
              <PlusIcon className="h-5 w-5" aria-hidden="true" />
              Add New
            </button>

            <Link
              to="/pos"
              className="inline-flex items-center gap-2 px-4 py-2 border border-brand-yellow/40 rounded-lg text-sm font-medium text-gray-100 bg-brand-gray hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-yellow focus:ring-offset-brand-gray"
            >
              <ShoppingCartIcon className="h-5 w-5 text-brand-yellow" aria-hidden="true" />
              POS
            </Link>

            <NotificationDropdown />

            <button type="button" className="relative p-2 text-gray-300 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray rounded-lg">
              <ChatBubbleLeftIcon className="h-6 w-6" aria-hidden="true" />
              <span className="absolute top-0 right-0 flex h-5 w-5 rounded-full bg-brand-yellow text-brand-black border-2 border-brand-gray text-xs font-medium items-center justify-center">
                2
              </span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={withTrustedClick(() => setIsLanguageMenuOpen(!isLanguageMenuOpen))}
                className="p-2 text-gray-300 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray rounded-lg"
                aria-haspopup="true"
                aria-expanded={isLanguageMenuOpen}
              >
                <GlobeAltIcon className="h-6 w-6" aria-hidden="true" />
              </button>

              {isLanguageMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-brand-gray rounded-lg shadow-lg border border-brand-yellow/20 py-1 z-50" role="menu">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-black/50 flex items-center gap-2 focus:outline-none focus:bg-black/60"
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={withTrustedClick(() => setIsProfileMenuOpen(!isProfileMenuOpen))}
                className="flex items-center gap-3 focus:outline-none"
                aria-haspopup="true"
                aria-expanded={isProfileMenuOpen}
              >
                <div className="relative">
                  <div className="h-9 w-9 rounded-full bg-brand-yellow flex items-center justify-center text-brand-black font-medium text-lg">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-400 border-2 border-brand-gray"></div>
                </div>
                <ChevronDownIcon className="h-4 w-4 text-gray-300" />
              </button>

              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-brand-gray rounded-lg shadow-lg border border-brand-yellow/20 py-1 z-50" role="menu">
                  <div className="px-4 py-2 border-b border-brand-yellow/10">
                    <p className="text-sm font-medium text-gray-100">{user?.name}</p>
                    <p className="text-xs text-gray-400">{user?.email}</p>
                  </div>
                  <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-black/50 focus:outline-none focus:bg-black/60">Profile Settings</button>
                  <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-black/50 focus:outline-none focus:bg-black/60">Help Center</button>
                  <button type="button" onClick={withTrustedClick(handleLogout)} className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 focus:outline-none focus:bg-red-500/20">Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-black/95 px-4 py-6 sm:px-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Search</h2>
            <button
              type="button"
              className="p-2 rounded-lg text-gray-200 hover:text-white hover:bg-black/40 focus:outline-none focus:ring-2 focus:ring-brand-yellow mobile-nav-trigger"
              onClick={() => setIsMobileSearchOpen(false)}
              aria-label="Close search"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </div>
            <label htmlFor="mobile-global-search" className="sr-only">Search</label>
            <input
              id="mobile-global-search"
              type="search"
              autoFocus
              placeholder="Search products, orders, or customers..."
              className="block w-full rounded-lg border border-brand-yellow/20 bg-brand-black/90 py-3 pl-10 pr-4 text-base text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            />
          </div>
        </div>
      )}
    </nav>
  );
};

export default TopNavBar;