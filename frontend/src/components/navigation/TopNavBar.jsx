import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMyShop } from '../../store/slices/shopSlice';
import { logout } from '../../store/slices/authSlice';
import {
  MagnifyingGlassIcon,
  BuildingStorefrontIcon,
  PlusIcon,
  BellIcon,
  ChatBubbleLeftIcon,
  ChevronDownIcon,
  Squares2X2Icon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { ShoppingCartIcon } from '@heroicons/react/24/solid';

const TopNavBar = ({ onMenuClick }) => {
  const withTrustedClick = (handler) => (event, ...rest) => {
    if (event && event.nativeEvent && event.nativeEvent.isTrusted === false) return;
    return handler(event, ...rest);
  };
  const dispatch = useDispatch();
  const [isStoreMenuOpen, setIsStoreMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);

  const user = useSelector((state) => state.auth?.user);
  const authShop = useSelector((state) => state.auth?.shop);
  const { shop, loading, error: stateError } = useSelector((state) => state.shop || {});

  const currentShop = shop || authShop || null;
  const navigate = useNavigate();

  useEffect(() => {
    if (!authShop && !shop) {
      dispatch(fetchMyShop());
    }
  }, [dispatch, authShop, shop]);

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

  return (
    <nav className="bg-brand-gray/95 backdrop-blur border-b border-brand-yellow/20">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left section: Menu + Logo */}
          <div className="flex items-center flex-shrink-0 space-x-2">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg text-gray-200 hover:bg-black/40"
              onClick={withTrustedClick(() => onMenuClick && onMenuClick())}
              aria-label="Open menu"
            >
              <Squares2X2Icon className="h-6 w-6" />
            </button>
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-brand-yellow rounded-lg flex items-center justify-center">
                <BuildingStorefrontIcon className="h-5 w-5 text-brand-black" />
              </div>
              <span className="text-xl font-bold text-brand-yellow">
                Zana POS
              </span>
            </Link>
          </div>

          {/* Center section: Search and Store selector */}
          <div className="flex-1 flex items-center justify-center px-8 space-x-4">
            <div className="flex-1 max-w-2xl relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="search"
                placeholder="Search products, orders, or customers..."
                className="block w-full pl-10 pr-3 py-2 border border-brand-yellow/20 rounded-lg bg-brand-black text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-transparent"
              />
            </div>

            {/* Store Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={withTrustedClick(() => setIsStoreMenuOpen(!isStoreMenuOpen))}
                className="flex items-center space-x-2 px-4 py-2 border border-brand-yellow/30 rounded-lg hover:bg-brand-black focus:outline-none focus:ring-2 focus:ring-brand-yellow text-gray-100"
                disabled={loading}
              >
                <BuildingStorefrontIcon className="h-5 w-5 text-brand-yellow" />
                <span className="text-sm font-medium">
                  {loading ? 'Loading...' : currentShop?.name || 'Your Shop'}
                </span>
                <ChevronDownIcon className="h-4 w-4 text-gray-300" />
              </button>

              {/* Store Dropdown */}
              {isStoreMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-brand-gray border border-brand-yellow/20 rounded-lg shadow-xl py-1 z-50">
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
                      <p className="text-sm text-gray-300 mb-1">No shop set yet.</p>
                      <p className="text-xs text-gray-400">Ask an admin to create your company shop.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right section: Actions and Profile */}
          <div className="flex items-center space-x-4">
            {/* Add New Button */}
            <button type="button" className="inline-flex items-center px-4 py-2 border border-brand-yellow/40 rounded-lg text-sm font-medium text-brand-black bg-brand-yellow hover:bg-brand-yellowDark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-yellow focus:ring-offset-brand-gray">
              <PlusIcon className="h-5 w-5 mr-1" />
              Add New
            </button>

            {/* POS Button */}
            <Link
              to="/pos"
              className="inline-flex items-center px-4 py-2 border border-brand-yellow/40 rounded-lg text-sm font-medium text-gray-100 bg-brand-gray hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-yellow focus:ring-offset-brand-gray"
            >
              <ShoppingCartIcon className="h-5 w-5 mr-1 text-brand-yellow" />
              POS
            </Link>

            {/* Notification Icons */}
            <button type="button" className="relative p-2 text-gray-300 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray rounded-lg">
              <BellIcon className="h-6 w-6" />
              <span className="absolute top-0 right-0 block h-5 w-5 rounded-full bg-brand-yellow text-brand-black border-2 border-brand-gray text-xs font-medium flex items-center justify-center">
                3
              </span>
            </button>

            <button type="button" className="relative p-2 text-gray-300 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray rounded-lg">
              <ChatBubbleLeftIcon className="h-6 w-6" />
              <span className="absolute top-0 right-0 block h-5 w-5 rounded-full bg-brand-yellow text-brand-black border-2 border-brand-gray text-xs font-medium flex items-center justify-center">
                2
              </span>
            </button>

            {/* Language Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={withTrustedClick(() => setIsLanguageMenuOpen(!isLanguageMenuOpen))}
                className="p-2 text-gray-300 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray rounded-lg"
              >
                <GlobeAltIcon className="h-6 w-6" />
              </button>

              {isLanguageMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-brand-gray rounded-lg shadow-lg border border-brand-yellow/20 py-1 z-50">
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-black/50 flex items-center space-x-2"
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={withTrustedClick(() => setIsProfileMenuOpen(!isProfileMenuOpen))}
                className="flex items-center space-x-3 focus:outline-none"
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
                <div className="absolute right-0 mt-2 w-48 bg-brand-gray rounded-lg shadow-lg border border-brand-yellow/20 py-1 z-50">
                  <div className="px-4 py-2 border-b border-brand-yellow/10">
                    <p className="text-sm font-medium text-gray-100">{user?.name}</p>
                    <p className="text-xs text-gray-400">{user?.email}</p>
                  </div>
                  <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-black/50">Profile Settings</button>
                  <button type="button" className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg:black/50">Help Center</button>
                  <button type="button" onClick={withTrustedClick(handleLogout)} className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10">Sign Out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default TopNavBar;