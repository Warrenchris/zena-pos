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
import { settingsAPI, authAPI, shopAPI } from '../services/api';
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
  InformationCircleIcon,
  PrinterIcon,
  CreditCardIcon,
  ReceiptPercentIcon,
  PhotoIcon,
  KeyIcon
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
  
  const [logoUploading, setLogoUploading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  
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

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPEG, WEBP, GIF, SVG)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Image file size must be less than 2MB');
      return;
    }

    try {
      setLogoUploading(true);
      const data = new FormData();
      data.append('logo', file);
      const res = await settingsAPI.uploadLogo(data);
      if (res.data?.logoUrl) {
        handleInputChange('businessLogo', res.data.logoUrl);
      }
    } catch (err) {
      console.error('Logo upload error:', err);
      alert(err.response?.data?.error || 'Failed to upload logo');
    } finally {
      setLogoUploading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    if (e) e.preventDefault();
    setPasswordStatus(null);

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Please fill in all password fields.' });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'New password must be at least 6 characters long.' });
      return;
    }

    try {
      setPasswordLoading(true);
      await authAPI.changePassword(passwordForm);
      setPasswordStatus({ type: 'success', message: 'Password changed successfully!' });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordStatus({ type: 'error', message: err.response?.data?.error || 'Failed to change password.' });
    } finally {
      setPasswordLoading(false);
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
      {/* Business Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Business Logo
        </label>
        <div className="flex items-center space-x-4">
          {formData.businessLogo ? (
            <div className="relative group">
              <img
                src={formData.businessLogo}
                alt="Business Logo Preview"
                className="h-20 w-20 object-contain rounded-lg border border-zana-borderTint bg-black/40 p-1"
              />
              <button
                type="button"
                onClick={() => handleInputChange('businessLogo', null)}
                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 focus:outline-none"
                title="Remove logo"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="h-20 w-20 rounded-lg border-2 border-dashed border-zana-borderTint bg-black/20 flex flex-col items-center justify-center text-white/50">
              <PhotoIcon className="h-8 w-8 text-white/40 mb-1" />
              <span className="text-[10px]">No Logo</span>
            </div>
          )}

          <div className="flex-1">
            <input
              type="file"
              accept="image/*"
              id="businessLogoInput"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <label
              htmlFor="businessLogoInput"
              className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md border text-black bg-zana-yellow border-zana-yellow hover:bg-zana-yellow/90 cursor-pointer transition-colors ${
                logoUploading ? 'opacity-50 cursor-wait' : ''
              }`}
            >
              <PhotoIcon className="mr-2 h-5 w-5" />
              {logoUploading ? 'Uploading Logo...' : 'Upload Logo Image'}
            </label>
            <p className="text-xs text-white/50 mt-1">
              Supports PNG, JPEG, WEBP, or SVG (Max size: 2MB).
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          System Name
        </label>
        <input
          type="text"
          value={formData.systemName || ''}
          onChange={(e) => handleInputChange('systemName', e.target.value)}
          className={`w-full px-3 py-2 bg-black/40 border rounded-md text-white focus:outline-none focus:ring-2 ${
            getError('systemName') 
              ? 'border-red-500/50 focus:ring-red-500' 
              : 'border-zana-borderTint focus:ring-zana-yellow'
          }`}
          placeholder="Enter system name"
        />
        {getError('systemName') && (
          <p className="mt-1 text-sm text-red-400">{getError('systemName')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            KRA PIN
          </label>
          <input
            type="text"
            value={formData.kraPin || ''}
            onChange={(e) => handleInputChange('kraPin', e.target.value)}
            className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
            placeholder="e.g. A012345678Z"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Business Registration Number
          </label>
          <input
            type="text"
            value={formData.registrationNumber || ''}
            onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
            className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
            placeholder="e.g. CPR/2023/12345"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Contact Email
        </label>
        <input
          type="email"
          value={formData.contactEmail || ''}
          onChange={(e) => handleInputChange('contactEmail', e.target.value)}
          className={`w-full px-3 py-2 bg-black/40 border rounded-md text-white focus:outline-none focus:ring-2 ${
            getError('contactEmail') 
              ? 'border-red-500/50 focus:ring-red-500' 
              : 'border-zana-borderTint focus:ring-zana-yellow'
          }`}
          placeholder="Enter contact email"
        />
        {getError('contactEmail') && (
          <p className="mt-1 text-sm text-red-400">{getError('contactEmail')}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Contact Phone
        </label>
        <input
          type="tel"
          value={formData.contactPhone || ''}
          onChange={(e) => handleInputChange('contactPhone', e.target.value)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
          placeholder="Enter contact phone"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Timezone
        </label>
        <select
          value={formData.timezone || 'Africa/Nairobi'}
          onChange={(e) => handleInputChange('timezone', e.target.value)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
        >
          <option value="Africa/Nairobi" className="bg-brand-black text-white">Africa/Nairobi</option>
          <option value="Africa/Lagos" className="bg-brand-black text-white">Africa/Lagos</option>
          <option value="Africa/Johannesburg" className="bg-brand-black text-white">Africa/Johannesburg</option>
          <option value="Africa/Cairo" className="bg-brand-black text-white">Africa/Cairo</option>
          <option value="UTC" className="bg-brand-black text-white">UTC</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Language
        </label>
        <select
          value={formData.language || 'en'}
          onChange={(e) => handleInputChange('language', e.target.value)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
        >
          <option value="en" className="bg-brand-black text-white">English</option>
          <option value="sw" className="bg-brand-black text-white">Swahili</option>
          <option value="fr" className="bg-brand-black text-white">French</option>
          <option value="ar" className="bg-brand-black text-white">Arabic</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Theme
        </label>
        <select
          value={formData.theme || 'dark'}
          onChange={(e) => handleInputChange('theme', e.target.value)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
        >
          <option value="light" className="bg-brand-black text-white">Light</option>
          <option value="dark" className="bg-brand-black text-white">Dark</option>
          <option value="system" className="bg-brand-black text-white">System</option>
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

  const renderPosSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Default Tax / VAT Rate (%)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={formData.taxRate !== undefined && formData.taxRate !== null ? formData.taxRate : 0}
          onChange={(e) => handleInputChange('taxRate', parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
          placeholder="e.g. 16.00"
        />
        <p className="text-xs text-white/50 mt-1">
          This tax rate will be automatically applied to net order subtotals in the POS checkout modal.
        </p>
      </div>
    </div>
  );

  const renderReceiptSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Receipt Header Text
        </label>
        <textarea
          rows={3}
          value={formData.receiptHeader || ''}
          onChange={(e) => handleInputChange('receiptHeader', e.target.value)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
          placeholder="Welcome to Zana POS! Thank you for shopping with us."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Receipt Footer Text
        </label>
        <textarea
          rows={3}
          value={formData.receiptFooter || ''}
          onChange={(e) => handleInputChange('receiptFooter', e.target.value)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
          placeholder="Goods once sold are non-refundable. Please come again!"
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-white">Show Business Logo on Receipt</h4>
          <p className="text-sm text-white/60">Display uploaded shop logo at the top of receipts</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.showLogoOnReceipt !== false}
            onChange={(e) => handleInputChange('showLogoOnReceipt', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-zana-yellow"></div>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Printer Type
        </label>
        <select
          value={formData.printerType || 'browser'}
          onChange={(e) => handleInputChange('printerType', e.target.value)}
          className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
        >
          <option value="browser" className="bg-brand-black text-white">Browser Print Dialog</option>
          <option value="thermal" className="bg-brand-black text-white">Thermal POS Printer (ESC/POS)</option>
        </select>
      </div>

      {formData.printerType === 'thermal' && (
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Printer IP Address / Port
          </label>
          <input
            type="text"
            value={formData.printerIP || ''}
            onChange={(e) => handleInputChange('printerIP', e.target.value)}
            className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
            placeholder="e.g. 192.168.1.100:9100"
          />
        </div>
      )}
    </div>
  );

  const renderPaymentSettings = () => {
    const enabledMethods = formData.enabledPaymentMethods || { cash: true, mobile: true, bank: false };
    
    const handleMethodToggle = (methodKey, isChecked) => {
      handleInputChange('enabledPaymentMethods', {
        ...enabledMethods,
        [methodKey]: isChecked
      });
    };

    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-md font-semibold text-zana-yellow mb-4">Enabled Payment Methods</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-black/40 border border-zana-borderTint rounded-md">
              <div>
                <h4 className="text-sm font-medium text-white">Cash Payments</h4>
                <p className="text-xs text-white/60">Allow cash checkout at POS</p>
              </div>
              <input
                type="checkbox"
                checked={enabledMethods.cash !== false}
                onChange={(e) => handleMethodToggle('cash', e.target.checked)}
                className="h-5 w-5 text-zana-yellow focus:ring-zana-yellow border-gray-600 rounded bg-gray-800"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-black/40 border border-zana-borderTint rounded-md">
              <div>
                <h4 className="text-sm font-medium text-white">Mobile Money (M-Pesa)</h4>
                <p className="text-xs text-white/60">Allow STK push and M-Pesa mobile money checkout</p>
              </div>
              <input
                type="checkbox"
                checked={enabledMethods.mobile !== false}
                onChange={(e) => handleMethodToggle('mobile', e.target.checked)}
                className="h-5 w-5 text-zana-yellow focus:ring-zana-yellow border-gray-600 rounded bg-gray-800"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-black/40 border border-zana-borderTint rounded-md">
              <div>
                <h4 className="text-sm font-medium text-white">Card / Bank Transfer</h4>
                <p className="text-xs text-white/60">Allow debit/credit card and bank transfer checkout</p>
              </div>
              <input
                type="checkbox"
                checked={enabledMethods.bank === true || enabledMethods.card === true}
                onChange={(e) => handleMethodToggle('bank', e.target.checked)}
                className="h-5 w-5 text-zana-yellow focus:ring-zana-yellow border-gray-600 rounded bg-gray-800"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-zana-borderTint space-y-4">
          <h3 className="text-md font-semibold text-zana-yellow mb-2">M-Pesa Daraja API Credentials</h3>
          <p className="text-xs text-white/60 mb-4">
            Enter your Safaricom Daraja API details. Secrets will be encrypted at rest.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Paybill Number
              </label>
              <input
                type="text"
                value={formData.paybillNumber || ''}
                onChange={(e) => handleInputChange('paybillNumber', e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
                placeholder="e.g. 174379"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Till Number
              </label>
              <input
                type="text"
                value={formData.tillNumber || ''}
                onChange={(e) => handleInputChange('tillNumber', e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
                placeholder="e.g. 888999"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Consumer Key
            </label>
            <input
              type="password"
              value={formData.consumerKey || ''}
              onChange={(e) => handleInputChange('consumerKey', e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
              placeholder="Enter Consumer Key"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Consumer Secret
            </label>
            <input
              type="password"
              value={formData.consumerSecret || ''}
              onChange={(e) => handleInputChange('consumerSecret', e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
              placeholder="Enter Consumer Secret"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Online Passkey
            </label>
            <input
              type="password"
              value={formData.passkey || ''}
              onChange={(e) => handleInputChange('passkey', e.target.value)}
              className="w-full px-3 py-2 bg-black/40 border border-zana-borderTint rounded-md text-white focus:outline-none focus:ring-2 focus:ring-zana-yellow"
              placeholder="Enter Passkey"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'pos':
        return renderPosSettings();
      case 'receipt':
        return renderReceiptSettings();
      case 'payments':
        return renderPaymentSettings();
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


