import React, { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  BellIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { addNotification, markAsRead, markAllAsRead, removeNotification } from '../store/slices/notificationsSlice';

const NotificationDropdown = () => {
  const dispatch = useDispatch();
  const { notifications, unreadCount } = useSelector((state) => state.notifications);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = (id) => {
    dispatch(markAsRead(id));
  };

  const handleMarkAllAsRead = () => {
    dispatch(markAllAsRead());
  };

  const handleRemove = (id) => {
    dispatch(removeNotification(id));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'sale':
        return ShoppingCartIcon;
      case 'low_stock':
        return ExclamationTriangleIcon;
      case 'payment':
        return CurrencyDollarIcon;
      case 'success':
        return CheckIcon;
      case 'warning':
        return ExclamationTriangleIcon;
      case 'error':
        return ExclamationTriangleIcon;
      default:
        return InformationCircleIcon;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'sale':
        return 'text-green-500';
      case 'low_stock':
        return 'text-yellow-500';
      case 'payment':
        return 'text-blue-500';
      case 'success':
        return 'text-green-500';
      case 'warning':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-300 hover:text-brand-yellow focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-gray rounded-lg transition-colors"
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-5 w-5 rounded-full bg-red-500 text-white text-xs font-medium items-center justify-center border-2 border-brand-gray">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-brand-gray border border-brand-yellow/20 rounded-lg shadow-xl z-50 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-brand-yellow/10">
            <div className="flex items-center space-x-2">
              <BellIcon className="h-5 w-5 text-brand-yellow" />
              <h3 className="text-lg font-semibold text-gray-100">Notifications</h3>
            </div>
            <div className="flex items-center space-x-2">
              {notifications.length > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-brand-yellow hover:text-yellow-400 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-[500px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-gray-400">
                <BellIcon className="h-12 w-12 mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-brand-yellow/10">
                {notifications.map((notification) => {
                  const Icon = getIcon(notification.type);
                  const iconColor = getTypeColor(notification.type);

                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-black/30 transition-colors ${!notification.read ? 'bg-brand-yellow/5' : ''}`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`flex-shrink-0 ${iconColor}`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className={`text-sm font-medium ${notification.read ? 'text-gray-300' : 'text-gray-100'}`}>
                                {notification.title}
                              </p>
                              {notification.message && (
                                <p className="mt-1 text-sm text-gray-400">{notification.message}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 ml-2">
                              {!notification.read && (
                                <button
                                  onClick={() => handleMarkAsRead(notification.id)}
                                  className="text-brand-yellow hover:text-yellow-400 transition-colors"
                                  title="Mark as read"
                                >
                                  <CheckIcon className="h-5 w-5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemove(notification.id)}
                                className="text-gray-500 hover:text-red-500 transition-colors"
                                title="Remove"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {formatTimestamp(notification.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 10 && (
            <div className="p-3 border-t border-brand-yellow/10 bg-black/20">
              <button className="w-full text-sm text-brand-yellow hover:text-yellow-400 transition-colors text-center">
                View All Notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;

