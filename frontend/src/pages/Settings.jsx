import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchSettings, 
  updateSettings, 
  resetSettings,
  refreshCurrencySettings,
  selectSettings,
  selectLoading,
  selectError,
  selectGeneralSettings,
  selectCurrencySettings,
  selectNotificationSettings,
  selectSecuritySettings,
  selectBackupSettings,
  selectUserManagementSettings,
  formatCurrency
} from '../store/slices/settingsSlice';
import { validateSettings } from '../utils/validation';
import useErrorHandler from '../hooks/useErrorHandler';
import {
  CogIcon,
  CurrencyDollarIcon,
  BellIcon,
  ShieldCheckIcon,
  CloudArrowUpIcon,
  UsersIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

const Settings = () => {
  const dispatch = useDispatch();
  const settings = useSelector(selectSettings);
  const loading = useSelector(selectLoading);
  const error = useSelector(selectError);
  
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'success', 'error'
  
  // Enhanced error handling
  const {
    errors: validationErrors,
    isLoading: isSubmitting,
    handleError,
    handleValidationErrors,
    clearError,
    clearAllErrors,
    getError,
    hasErrors,
    handleFormSubmission
  } = useErrorHandler({
    onError: (error) => {
      console.error('Settings error:', error);
    }
  });

  // Load settings on component mount
  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  // Initialize form data when settings are loaded
  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      setFormData(settings);
    }
  }, [settings]);

  // Check for changes
  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      const hasFormChanges = Object.keys(formData).some(key => 
        formData[key] !== settings[key]
      );
      setHasChanges(hasFormChanges);
    }
  }, [formData, settings]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear validation error for this field when user starts typing
    if (getError(field)) {
      clearError(field);
    }
  };

  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      clearAllErrors();
      
      // Validate form data
      const validation = validateSettings(formData);
      if (!validation.isValid) {
        handleValidationErrors(validation.errors);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(null), 5000);
        return;
      }
      
      await dispatch(updateSettings(formData)).unwrap();
      
      // If currency settings were updated, refresh them specifically
      const currencyFields = ['defaultCurrency', 'currencySymbol', 'currencyPosition', 'decimalPlaces'];
      const hasCurrencyChanges = currencyFields.some(field => formData[field] !== settings[field]);
      
      if (hasCurrencyChanges) {
        await dispatch(refreshCurrencySettings()).unwrap();
      }
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      handleError(error, 'settings_save');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 5000);
    }
  };

  const handleReset = async () => {
    try {
      setSaveStatus('saving');
      await dispatch(resetSettings()).unwrap();
      
      // Refresh currency settings after reset
      await dispatch(refreshCurrencySettings()).unwrap();
      
      setSaveStatus('success');
      setShowResetConfirm(false);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 5000);
    }
  };

  const tabs = [
    { id: 'general', name: 'General', icon: CogIcon },
    { id: 'currency', name: 'Currency', icon: CurrencyDollarIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    { id: 'backup', name: 'Data & Backup', icon: CloudArrowUpIcon },
    { id: 'users', name: 'User Management', icon: UsersIcon },
  ];

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          System Name
        </label>
        <input
          type="text"
          value={formData.systemName || ''}
          onChange={(e) => handleInputChange('systemName', e.target.value)}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
            getError('systemName') 
              ? 'border-red-300 focus:ring-red-500' 
              : 'border-gray-300 focus:ring-blue-500'
          }`}
          placeholder="Enter system name"
        />
        {getError('systemName') && (
          <p className="mt-1 text-sm text-red-600">{getError('systemName')}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Contact Email
        </label>
        <input
          type="email"
          value={formData.contactEmail || ''}
          onChange={(e) => handleInputChange('contactEmail', e.target.value)}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
            getError('contactEmail') 
              ? 'border-red-300 focus:ring-red-500' 
              : 'border-gray-300 focus:ring-blue-500'
          }`}
          placeholder="Enter contact email"
        />
        {getError('contactEmail') && (
          <p className="mt-1 text-sm text-red-600">{getError('contactEmail')}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Contact Phone
        </label>
        <input
          type="tel"
          value={formData.contactPhone || ''}
          onChange={(e) => handleInputChange('contactPhone', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter contact phone"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Timezone
        </label>
        <select
          value={formData.timezone || 'Africa/Nairobi'}
          onChange={(e) => handleInputChange('timezone', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Africa/Nairobi">Africa/Nairobi</option>
          <option value="Africa/Lagos">Africa/Lagos</option>
          <option value="Africa/Johannesburg">Africa/Johannesburg</option>
          <option value="Africa/Cairo">Africa/Cairo</option>
          <option value="UTC">UTC</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Language
        </label>
        <select
          value={formData.language || 'en'}
          onChange={(e) => handleInputChange('language', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="en">English</option>
          <option value="sw">Swahili</option>
          <option value="fr">French</option>
          <option value="ar">Arabic</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Theme
        </label>
        <select
          value={formData.theme || 'dark'}
          onChange={(e) => handleInputChange('theme', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </div>
    </div>
  );

  const renderCurrencySettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default Currency
        </label>
        <select
          value={formData.defaultCurrency || 'KES'}
          onChange={(e) => handleInputChange('defaultCurrency', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="KES">Kenyan Shilling (KES)</option>
          <option value="USD">US Dollar (USD)</option>
          <option value="NGN">Nigerian Naira (NGN)</option>
          <option value="ZAR">South African Rand (ZAR)</option>
          <option value="GHS">Ghanaian Cedi (GHS)</option>
          <option value="TZS">Tanzanian Shilling (TZS)</option>
          <option value="UGX">Ugandan Shilling (UGX)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Currency Symbol
        </label>
        <input
          type="text"
          value={formData.currencySymbol || ''}
          onChange={(e) => handleInputChange('currencySymbol', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g., KSh, $, ₦"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Currency Position
        </label>
        <select
          value={formData.currencyPosition || 'before'}
          onChange={(e) => handleInputChange('currencyPosition', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="before">Before amount (KSh 100)</option>
          <option value="after">After amount (100 KSh)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Decimal Places
        </label>
        <input
          type="number"
          min="0"
          max="4"
          value={formData.decimalPlaces || 2}
          onChange={(e) => handleInputChange('decimalPlaces', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-blue-50 p-4 rounded-md">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Preview</h4>
        <p className="text-blue-700">
          {formatCurrency(1234.56, {
            currencySymbol: formData.currencySymbol || 'KSh',
            currencyPosition: formData.currencyPosition || 'before',
            decimalPlaces: formData.decimalPlaces || 2
          })}
        </p>
      </div>
    </div>
  );

  const renderNotificationSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Enable Notifications</h4>
          <p className="text-sm text-gray-500">Show system notifications</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableNotifications || false}
            onChange={(e) => handleInputChange('enableNotifications', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Sound Alerts</h4>
          <p className="text-sm text-gray-500">Play sound for notifications</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableSoundAlerts || false}
            onChange={(e) => handleInputChange('enableSoundAlerts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Email Alerts</h4>
          <p className="text-sm text-gray-500">Send email notifications</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableEmailAlerts || false}
            onChange={(e) => handleInputChange('enableEmailAlerts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Success Toasts</h4>
          <p className="text-sm text-gray-500">Show success messages</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableSuccessToasts || false}
            onChange={(e) => handleInputChange('enableSuccessToasts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Error Toasts</h4>
          <p className="text-sm text-gray-500">Show error messages</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableErrorToasts || false}
            onChange={(e) => handleInputChange('enableErrorToasts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Password Minimum Length
        </label>
        <input
          type="number"
          min="6"
          max="20"
          value={formData.passwordMinLength || 8}
          onChange={(e) => handleInputChange('passwordMinLength', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Require Special Characters</h4>
          <p className="text-sm text-gray-500">Force special characters in passwords</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.requireSpecialChars || false}
            onChange={(e) => handleInputChange('requireSpecialChars', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Session Timeout (minutes)
        </label>
        <input
          type="number"
          min="30"
          max="1440"
          value={formData.sessionTimeout || 480}
          onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Two-Factor Authentication</h4>
          <p className="text-sm text-gray-500">Enable 2FA for enhanced security</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableTwoFactor || false}
            onChange={(e) => handleInputChange('enableTwoFactor', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Max Login Attempts
        </label>
        <input
          type="number"
          min="3"
          max="10"
          value={formData.maxLoginAttempts || 5}
          onChange={(e) => handleInputChange('maxLoginAttempts', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );

  const renderBackupSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Auto Backup</h4>
          <p className="text-sm text-gray-500">Automatically backup data</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.autoBackupEnabled || false}
            onChange={(e) => handleInputChange('autoBackupEnabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Backup Frequency
        </label>
        <select
          value={formData.backupFrequency || 'daily'}
          onChange={(e) => handleInputChange('backupFrequency', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Backup Retention (days)
        </label>
        <input
          type="number"
          min="7"
          max="365"
          value={formData.backupRetentionDays || 30}
          onChange={(e) => handleInputChange('backupRetentionDays', parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );

  const renderUserManagementSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Allow User Registration</h4>
          <p className="text-sm text-gray-500">Allow new users to register</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.allowUserRegistration || false}
            onChange={(e) => handleInputChange('allowUserRegistration', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Require Email Verification</h4>
          <p className="text-sm text-gray-500">Verify email addresses for new users</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.requireEmailVerification || false}
            onChange={(e) => handleInputChange('requireEmailVerification', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'currency':
        return renderCurrencySettings();
      case 'notifications':
        return renderNotificationSettings();
      case 'security':
        return renderSecuritySettings();
      case 'backup':
        return renderBackupSettings();
      case 'users':
        return renderUserManagementSettings();
      default:
        return renderGeneralSettings();
    }
  };

  if (loading && !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zana-yellow mx-auto"></div>
          <p className="mt-4 text-white/70">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-brand-black text-white min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zana-yellow">Settings</h1>
        <p className="mt-2 text-white/70">
          Manage your system configuration and preferences
        </p>
      </div>

      {/* Status Messages */}
      {saveStatus === 'success' && (
        <div className="mb-6 bg-black/40 border border-green-500/30 rounded-md p-4">
          <div className="flex">
            <CheckIcon className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-green-300">
                Settings saved successfully!
              </p>
            </div>
          </div>
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="mb-6 bg-black/40 border border-red-500/30 rounded-md p-4">
          <div className="flex">
            <XMarkIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-red-300">
                Failed to save settings. Please try again.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-black/40 border border-red-500/30 rounded-md p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-red-300">
                {error}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-brand-black shadow-zana border border-zana-borderTint rounded-lg">
        <div className="flex">
          {/* Sidebar */}
          <div className="w-64 bg-black rounded-l-lg border-r border-zana-borderTint">
            <nav className="p-4 space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors border ${
                      activeTab === tab.id
                        ? 'bg-zana-yellow text-black border-zana-yellow'
                        : 'text-zana-yellow border-zana-borderTint hover:bg-zana-yellow/10'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-medium text-zana-yellow capitalize">
                {tabs.find(tab => tab.id === activeTab)?.name} Settings
              </h2>
              <p className="text-sm text-white/70 mt-1">
                Configure your {tabs.find(tab => tab.id === activeTab)?.name.toLowerCase()} preferences
              </p>
            </div>

            {renderTabContent()}

            {/* Action Buttons */}
            <div className="mt-8 flex justify-between">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-4 py-2 text-sm font-medium text-red-400 bg-black/40 border border-red-500/30 rounded-md hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              >
                Reset to Defaults
              </button>

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setFormData(settings);
                    setHasChanges(false);
                  }}
                  disabled={!hasChanges}
                  className="px-4 py-2 text-sm font-medium text-white bg-black/40 border border-zana-borderTint rounded-md hover:bg-zana-yellow/10 focus:outline-none focus:ring-2 focus:ring-zana-yellow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!hasChanges || saveStatus === 'saving'}
                  className="px-4 py-2 text-sm font-medium text-black bg-zana-yellow border border-zana-yellow rounded-md hover:bg-zana-yellow/90 focus:outline-none focus:ring-2 focus:ring-zana-yellow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-zana rounded-md bg-brand-black border-zana-borderTint">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-500/10 border border-red-500/30">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">
                <span className="text-white">Reset Settings</span>
              </h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-white/70">Are you sure you want to reset all settings to their default values? This action cannot be undone.</p>
              </div>
              <div className="flex justify-center space-x-4 mt-4">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-white bg-black/40 border border-zana-borderTint rounded-md hover:bg-zana-yellow/10"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600/80 border border-red-500/30 rounded-md hover:bg-red-600"
                >
                  Reset Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;


