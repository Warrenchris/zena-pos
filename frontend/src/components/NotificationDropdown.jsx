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
        className="relative h-9 w-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-lg transition-colors duration-150"
        aria-label="Notifications"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 rounded-full bg-danger text-white text-[10px] font-bold items-center justify-center ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 bg-white border border-border-default rounded-xl shadow-floating z-50 flex flex-col w-[22rem] sm:w-[24rem] max-h-[85vh]"
          style={{
            insetInlineEnd: 0,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border-default/70">
            <div className="flex items-center space-x-2">
              <BellIcon className="h-5 w-5 text-primary" />
              <h3 className="text-h3 font-semibold text-text-primary tracking-tight">Notifications</h3>
            </div>
            <div className="flex items-center space-x-2">
              {notifications.length > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-caption font-medium text-primary hover:text-primary-hover transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1 min-h-0" style={{ maxHeight: '70vh' }}>
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-text-muted">
                <BellIcon className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-caption">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border-default/50">
                {notifications.map((notification) => {
                  const Icon = getIcon(notification.type);
                  const iconColor = getTypeColor(notification.type);

                  return (
                    <div
                      key={notification.id}
                      className={`p-4 hover:bg-surface-2/60 transition-colors ${!notification.read ? 'bg-primary/5' : ''}`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className={`flex-shrink-0 ${iconColor}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className={`text-body font-medium break-words ${notification.read ? 'text-text-secondary' : 'text-text-primary'}`}>
                                {notification.title}
                              </p>
                              {notification.message && (
                                <p className="mt-1 text-caption text-text-secondary break-words whitespace-pre-wrap">{notification.message}</p>
                              )}
                            </div>
                            <div className="flex items-center space-x-1.5 ml-2">
                              {!notification.read && (
                                <button
                                  onClick={() => handleMarkAsRead(notification.id)}
                                  className="text-primary hover:text-primary-hover transition-colors p-1"
                                  title="Mark as read"
                                >
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleRemove(notification.id)}
                                className="text-text-muted hover:text-danger transition-colors p-1"
                                title="Remove"
                              >
                                <XMarkIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-caption text-text-muted">
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
            <div className="p-3 border-t border-border-default/70 bg-surface-0">
              <button className="w-full text-caption font-medium text-primary hover:text-primary-hover transition-colors text-center">
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

