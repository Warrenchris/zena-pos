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
  KeyIcon,
  ArchiveBoxIcon
} from '@heroicons/react/24/outline';

import RolePermissionMatrix from '../components/RolePermissionMatrix';

const Settings = () => {
  const dispatch = useDispatch();
  const settings = useSelector(selectSettings);
  const loading = useSelector(selectLoading);
  const error = useSelector(selectError);
  const currentUser = useSelector((state) => state.auth?.user);
  const userRole = currentUser?.role || 'cashier';
  
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

    if (!file.type.startsWith('image/') || file.type.includes('svg')) {
      alert('Please select a valid image file (PNG, JPEG, WEBP, GIF)');
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
    { id: 'pos', name: 'POS Configuration', icon: ReceiptPercentIcon },
    { id: 'inventory', name: 'Inventory & Catalog', icon: ArchiveBoxIcon },
    { id: 'receipt', name: 'Receipt & Printer', icon: PrinterIcon },
    { id: 'payments', name: 'Payment Methods', icon: CreditCardIcon },
    { id: 'currency', name: 'Currency', icon: CurrencyDollarIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    ...(userRole === 'admin'
      ? [{ id: 'permissions', name: 'Role Permissions', icon: ShieldCheckIcon }]
      : []),
    { id: 'backup', name: 'Data & Backup', icon: CloudArrowUpIcon },
    { id: 'users', name: 'User Management', icon: UsersIcon },
  ];

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      {/* Business Logo Upload */}
      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Business Logo
        </label>
        <div className="flex items-center space-x-4">
          {formData.businessLogo ? (
            <div className="relative group">
              <img
                src={formData.businessLogo}
                alt="Business Logo Preview"
                className="h-20 w-20 object-contain rounded-xl border border-border-default bg-surface-2 p-1"
              />
              <button
                type="button"
                onClick={() => handleInputChange('businessLogo', null)}
                className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-1 hover:bg-danger/90 focus:outline-none shadow-sm"
                title="Remove logo"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="h-20 w-20 rounded-xl border-2 border-dashed border-border-default bg-surface-2/50 flex flex-col items-center justify-center text-text-muted">
              <PhotoIcon className="h-8 w-8 text-text-muted mb-1" />
              <span className="text-[10px] font-medium">No Logo</span>
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
              className={`inline-flex items-center px-4 py-2 text-small font-semibold rounded-xl text-white bg-primary hover:bg-primary-hover active:bg-primary-active cursor-pointer transition-all shadow-2xs ${
                logoUploading ? 'opacity-50 cursor-wait' : ''
              }`}
            >
              <PhotoIcon className="mr-2 h-4 w-4" />
              {logoUploading ? 'Uploading Logo...' : 'Upload Logo Image'}
            </label>
            <p className="text-caption text-text-muted mt-1.5">
              Supports PNG, JPEG, WEBP, or SVG (Max size: 2MB).
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          System Name
        </label>
        <input
          type="text"
          value={formData.systemName || ''}
          onChange={(e) => handleInputChange('systemName', e.target.value)}
          className={`w-full px-3.5 py-2.5 rounded-xl border bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 transition-all ${
            getError('systemName') 
              ? 'border-danger/50 focus:ring-danger/30' 
              : 'border-border-default focus:ring-primary/30 focus:border-primary'
          }`}
          placeholder="Enter system name"
        />
        {getError('systemName') && (
          <p className="mt-1 text-caption text-danger">{getError('systemName')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-small font-semibold text-text-primary mb-1.5">
            KRA PIN
          </label>
          <input
            type="text"
            value={formData.kraPin || ''}
            onChange={(e) => handleInputChange('kraPin', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            placeholder="e.g. A012345678Z"
          />
        </div>

        <div>
          <label className="block text-small font-semibold text-text-primary mb-1.5">
            Business Registration Number
          </label>
          <input
            type="text"
            value={formData.registrationNumber || ''}
            onChange={(e) => handleInputChange('registrationNumber', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            placeholder="e.g. CPR/2023/12345"
          />
        </div>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Contact Email
        </label>
        <input
          type="email"
          value={formData.contactEmail || ''}
          onChange={(e) => handleInputChange('contactEmail', e.target.value)}
          className={`w-full px-3.5 py-2.5 rounded-xl border bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 transition-all ${
            getError('contactEmail') 
              ? 'border-danger/50 focus:ring-danger/30' 
              : 'border-border-default focus:ring-primary/30 focus:border-primary'
          }`}
          placeholder="Enter contact email"
        />
        {getError('contactEmail') && (
          <p className="mt-1 text-caption text-danger">{getError('contactEmail')}</p>
        )}
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Contact Phone
        </label>
        <input
          type="tel"
          value={formData.contactPhone || ''}
          onChange={(e) => handleInputChange('contactPhone', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="Enter contact phone"
        />
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Timezone
        </label>
        <select
          value={formData.timezone || 'Africa/Nairobi'}
          onChange={(e) => handleInputChange('timezone', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="Africa/Nairobi" className="bg-surface text-text-primary">Africa/Nairobi</option>
          <option value="Africa/Lagos" className="bg-surface text-text-primary">Africa/Lagos</option>
          <option value="Africa/Johannesburg" className="bg-surface text-text-primary">Africa/Johannesburg</option>
          <option value="Africa/Cairo" className="bg-surface text-text-primary">Africa/Cairo</option>
          <option value="UTC" className="bg-surface text-text-primary">UTC</option>
        </select>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Language
        </label>
        <select
          value={formData.language || 'en'}
          onChange={(e) => handleInputChange('language', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="en" className="bg-surface text-text-primary">English</option>
          <option value="sw" className="bg-surface text-text-primary">Swahili</option>
          <option value="fr" className="bg-surface text-text-primary">French</option>
          <option value="ar" className="bg-surface text-text-primary">Arabic</option>
        </select>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Theme
        </label>
        <select
          value={formData.theme || 'dark'}
          onChange={(e) => handleInputChange('theme', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="light" className="bg-surface text-text-primary">Light</option>
          <option value="dark" className="bg-surface text-text-primary">Dark</option>
          <option value="system" className="bg-surface text-text-primary">System</option>
        </select>
      </div>
    </div>
  );

  const renderCurrencySettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Default Currency
        </label>
        <select
          value={formData.defaultCurrency || 'KES'}
          onChange={(e) => handleInputChange('defaultCurrency', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="KES" className="bg-surface text-text-primary">Kenyan Shilling (KES)</option>
          <option value="USD" className="bg-surface text-text-primary">US Dollar (USD)</option>
          <option value="NGN" className="bg-surface text-text-primary">Nigerian Naira (NGN)</option>
          <option value="ZAR" className="bg-surface text-text-primary">South African Rand (ZAR)</option>
          <option value="GHS" className="bg-surface text-text-primary">Ghanaian Cedi (GHS)</option>
          <option value="TZS" className="bg-surface text-text-primary">Tanzanian Shilling (TZS)</option>
          <option value="UGX" className="bg-surface text-text-primary">Ugandan Shilling (UGX)</option>
        </select>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Currency Symbol
        </label>
        <input
          type="text"
          value={formData.currencySymbol || ''}
          onChange={(e) => handleInputChange('currencySymbol', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="e.g., KSh, $, ₦"
        />
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Currency Position
        </label>
        <select
          value={formData.currencyPosition || 'before'}
          onChange={(e) => handleInputChange('currencyPosition', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="before" className="bg-surface text-text-primary">Before amount (KSh 100)</option>
          <option value="after" className="bg-surface text-text-primary">After amount (100 KSh)</option>
        </select>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Decimal Places
        </label>
        <input
          type="number"
          min="0"
          max="4"
          value={formData.decimalPlaces || 2}
          onChange={(e) => handleInputChange('decimalPlaces', parseInt(e.target.value))}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </div>

      <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5">
        <h4 className="text-small font-semibold text-primary mb-1">Preview</h4>
        <p className="text-h3 font-bold text-text-primary">
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
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Enable Notifications</h4>
          <p className="text-caption text-text-muted mt-0.5">Show system notifications</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableNotifications || false}
            onChange={(e) => handleInputChange('enableNotifications', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Sound Alerts</h4>
          <p className="text-caption text-text-muted mt-0.5">Play sound for notifications</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableSoundAlerts || false}
            onChange={(e) => handleInputChange('enableSoundAlerts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Email Alerts</h4>
          <p className="text-caption text-text-muted mt-0.5">Send email notifications</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableEmailAlerts || false}
            onChange={(e) => handleInputChange('enableEmailAlerts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Success Toasts</h4>
          <p className="text-caption text-text-muted mt-0.5">Show success messages</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableSuccessToasts || false}
            onChange={(e) => handleInputChange('enableSuccessToasts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Error Toasts</h4>
          <p className="text-caption text-text-muted mt-0.5">Show error messages</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.enableErrorToasts || false}
            onChange={(e) => handleInputChange('enableErrorToasts', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div className="pt-4 border-t border-border-default">
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          AI Insights Digest Frequency
        </label>
        <select
          value={formData.aiDigestFrequency || 'weekly'}
          onChange={(e) => handleInputChange('aiDigestFrequency', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="none" className="bg-surface text-text-primary">Disabled (None)</option>
          <option value="daily" className="bg-surface text-text-primary">Daily Summary Email</option>
          <option value="weekly" className="bg-surface text-text-primary">Weekly Summary Email</option>
        </select>
        <p className="text-caption text-text-muted mt-1">
          Frequency of automated AI inventory and sales digest reports sent to admin email.
        </p>
      </div>
    </div>
  );

  const renderInventorySettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Global Low-Stock Threshold
        </label>
        <input
          type="number"
          min="0"
          max="10000"
          value={formData.lowStockThreshold !== undefined && formData.lowStockThreshold !== null ? formData.lowStockThreshold : 10}
          onChange={(e) => handleInputChange('lowStockThreshold', parseInt(e.target.value, 10) || 0)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="e.g. 10"
        />
        <p className="text-caption text-text-muted mt-1">
          Default stock reorder threshold used when a product's individual reorder point is unconfigured.
        </p>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Auto SKU Prefix
        </label>
        <input
          type="text"
          value={formData.skuPrefix || 'SKU'}
          onChange={(e) => handleInputChange('skuPrefix', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="e.g. SKU, PROD, ITEM"
        />
        <p className="text-caption text-text-muted mt-1">
          Prefix used when automatically generating product SKUs during product creation.
        </p>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Auto Barcode Standard
        </label>
        <select
          value={formData.barcodeFormat || 'EAN13'}
          onChange={(e) => handleInputChange('barcodeFormat', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="EAN13" className="bg-surface text-text-primary">EAN-13 (13 Digits with Check-Digit)</option>
          <option value="UPC" className="bg-surface text-text-primary">UPC-A (12 Digits with Check-Digit)</option>
          <option value="CODE128" className="bg-surface text-text-primary">CODE128 (Alpha-Numeric)</option>
        </select>
        <p className="text-caption text-text-muted mt-1">
          Standard used to generate barcode values when a product barcode is left blank.
        </p>
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-8">
      {/* Change Password Form */}
      <div className="p-5 bg-surface-2/40 border border-border-default rounded-2xl space-y-4 shadow-2xs">
        <div className="flex items-center space-x-2 text-primary font-semibold">
          <KeyIcon className="h-5 w-5" />
          <h3 className="text-small font-bold text-text-primary">Change Account Password</h3>
        </div>

        {passwordStatus && (
          <div
            className={`p-3.5 rounded-xl text-small flex items-center ${
              passwordStatus.type === 'success'
                ? 'bg-success-muted border border-success-border text-success-text'
                : 'bg-danger-muted border border-danger-border text-danger-text'
            }`}
          >
            {passwordStatus.type === 'success' ? (
              <CheckIcon className="h-5 w-5 mr-2 shrink-0 text-success" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 mr-2 shrink-0 text-danger" />
            )}
            <span>{passwordStatus.message}</span>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-small font-semibold text-text-primary mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1">
              New Password
            </label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={passwordLoading}
            className={`h-9 px-4 inline-flex items-center justify-center rounded-xl text-small font-semibold text-white bg-primary hover:bg-primary-hover active:bg-primary-active transition-all shadow-2xs ${
              passwordLoading ? 'opacity-50 cursor-wait' : ''
            }`}
          >
            {passwordLoading ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>

      <div className="pt-4 border-t border-border-default space-y-4">
        <h3 className="text-small font-bold text-text-primary">System Security Policies</h3>
        
        <div>
          <label className="block text-small font-semibold text-text-primary mb-1.5">
            Password Minimum Length
          </label>
          <input
            type="number"
            min="6"
            max="20"
            value={formData.passwordMinLength || 8}
            onChange={(e) => handleInputChange('passwordMinLength', parseInt(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
          <div>
            <h4 className="text-small font-semibold text-text-primary">Require Special Characters</h4>
            <p className="text-caption text-text-muted mt-0.5">Force special characters in passwords</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.requireSpecialChars || false}
              onChange={(e) => handleInputChange('requireSpecialChars', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div>
          <label className="block text-small font-semibold text-text-primary mb-1.5">
            Session Timeout (minutes)
          </label>
          <input
            type="number"
            min="30"
            max="1440"
            value={formData.sessionTimeout || 480}
            onChange={(e) => handleInputChange('sessionTimeout', parseInt(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>

        <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
          <div>
            <h4 className="text-small font-semibold text-text-primary">Two-Factor Authentication</h4>
            <p className="text-caption text-text-muted mt-0.5">Enable 2FA for enhanced security</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.enableTwoFactor || false}
              onChange={(e) => handleInputChange('enableTwoFactor', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        <div>
          <label className="block text-small font-semibold text-text-primary mb-1.5">
            Max Login Attempts
          </label>
          <input
            type="number"
            min="3"
            max="10"
            value={formData.maxLoginAttempts || 5}
            onChange={(e) => handleInputChange('maxLoginAttempts', parseInt(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
        </div>
      </div>
    </div>
  );

  const renderBackupSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Auto Backup</h4>
          <p className="text-caption text-text-muted mt-0.5">Automatically backup data</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.autoBackupEnabled || false}
            onChange={(e) => handleInputChange('autoBackupEnabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Backup Frequency
        </label>
        <select
          value={formData.backupFrequency || 'daily'}
          onChange={(e) => handleInputChange('backupFrequency', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="daily" className="bg-surface text-text-primary">Daily</option>
          <option value="weekly" className="bg-surface text-text-primary">Weekly</option>
          <option value="monthly" className="bg-surface text-text-primary">Monthly</option>
        </select>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Backup Retention (days)
        </label>
        <input
          type="number"
          min="7"
          max="365"
          value={formData.backupRetentionDays || 30}
          onChange={(e) => handleInputChange('backupRetentionDays', parseInt(e.target.value))}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </div>
    </div>
  );

  const renderUserManagementSettings = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Allow User Registration</h4>
          <p className="text-caption text-text-muted mt-0.5">Allow new users to register</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.allowUserRegistration || false}
            onChange={(e) => handleInputChange('allowUserRegistration', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Require Email Verification</h4>
          <p className="text-caption text-text-muted mt-0.5">Verify email addresses for new users</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.requireEmailVerification || false}
            onChange={(e) => handleInputChange('requireEmailVerification', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
    </div>
  );

  const renderPosSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Default Tax / VAT Rate (%)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={formData.taxRate !== undefined && formData.taxRate !== null ? formData.taxRate : 0}
          onChange={(e) => handleInputChange('taxRate', parseFloat(e.target.value) || 0)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="e.g. 16.00"
        />
        <p className="text-caption text-text-muted mt-1">
          This tax rate will be automatically applied to net order subtotals in the POS checkout modal.
        </p>
      </div>
    </div>
  );

  const renderReceiptSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Receipt Header Text
        </label>
        <textarea
          rows={3}
          value={formData.receiptHeader || ''}
          onChange={(e) => handleInputChange('receiptHeader', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="Welcome to Zana POS! Thank you for shopping with us."
        />
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Receipt Footer Text
        </label>
        <textarea
          rows={3}
          value={formData.receiptFooter || ''}
          onChange={(e) => handleInputChange('receiptFooter', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          placeholder="Goods once sold are non-refundable. Please come again!"
        />
      </div>

      <div className="flex items-center justify-between p-3.5 rounded-xl border border-border-default bg-surface-2/40">
        <div>
          <h4 className="text-small font-semibold text-text-primary">Show Business Logo on Receipt</h4>
          <p className="text-caption text-text-muted mt-0.5">Display uploaded shop logo at the top of receipts</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={formData.showLogoOnReceipt !== false}
            onChange={(e) => handleInputChange('showLogoOnReceipt', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-3 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-default after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>

      <div>
        <label className="block text-small font-semibold text-text-primary mb-1.5">
          Printer Type
        </label>
        <select
          value={formData.printerType || 'browser'}
          onChange={(e) => handleInputChange('printerType', e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        >
          <option value="browser" className="bg-surface text-text-primary">Browser Print Dialog</option>
          <option value="thermal" className="bg-surface text-text-primary">Thermal POS Printer (ESC/POS)</option>
        </select>
      </div>

      {formData.printerType === 'thermal' && (
        <div>
          <label className="block text-small font-semibold text-text-primary mb-1.5">
            Printer IP Address / Port
          </label>
          <input
            type="text"
            value={formData.printerIP || ''}
            onChange={(e) => handleInputChange('printerIP', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
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
          <h3 className="text-small font-bold text-text-primary mb-4">Enabled Payment Methods</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3.5 bg-surface-2/40 border border-border-default rounded-xl">
              <div>
                <h4 className="text-small font-semibold text-text-primary">Cash Payments</h4>
                <p className="text-caption text-text-muted mt-0.5">Allow cash checkout at POS</p>
              </div>
              <input
                type="checkbox"
                checked={enabledMethods.cash !== false}
                onChange={(e) => handleMethodToggle('cash', e.target.checked)}
                className="h-5 w-5 text-primary focus:ring-primary/30 border-border-default rounded-lg bg-surface cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-surface-2/40 border border-border-default rounded-xl">
              <div>
                <h4 className="text-small font-semibold text-text-primary">Mobile Money (M-Pesa)</h4>
                <p className="text-caption text-text-muted mt-0.5">Allow STK push and M-Pesa mobile money checkout</p>
              </div>
              <input
                type="checkbox"
                checked={enabledMethods.mobile !== false}
                onChange={(e) => handleMethodToggle('mobile', e.target.checked)}
                className="h-5 w-5 text-primary focus:ring-primary/30 border-border-default rounded-lg bg-surface cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-surface-2/40 border border-border-default rounded-xl">
              <div>
                <h4 className="text-small font-semibold text-text-primary">Card / Bank Transfer</h4>
                <p className="text-caption text-text-muted mt-0.5">Allow debit/credit card and bank transfer checkout</p>
              </div>
              <input
                type="checkbox"
                checked={enabledMethods.bank === true || enabledMethods.card === true}
                onChange={(e) => handleMethodToggle('bank', e.target.checked)}
                className="h-5 w-5 text-primary focus:ring-primary/30 border-border-default rounded-lg bg-surface cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border-default space-y-4">
          <h3 className="text-small font-bold text-text-primary mb-1">M-Pesa Daraja API Credentials</h3>
          <p className="text-caption text-text-muted mb-4">
            Enter your Safaricom Daraja API details. Secrets will be encrypted at rest.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1.5">
                Paybill Number
              </label>
              <input
                type="text"
                value={formData.paybillNumber || ''}
                onChange={(e) => handleInputChange('paybillNumber', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder="e.g. 174379"
              />
            </div>

            <div>
              <label className="block text-small font-semibold text-text-primary mb-1.5">
                Till Number
              </label>
              <input
                type="text"
                value={formData.tillNumber || ''}
                onChange={(e) => handleInputChange('tillNumber', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder="e.g. 888999"
              />
            </div>
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1.5">
              Consumer Key
            </label>
            <input
              type="password"
              value={formData.consumerKey || ''}
              onChange={(e) => handleInputChange('consumerKey', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              placeholder="Enter Consumer Key"
            />
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1.5">
              Consumer Secret
            </label>
            <input
              type="password"
              value={formData.consumerSecret || ''}
              onChange={(e) => handleInputChange('consumerSecret', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              placeholder="Enter Consumer Secret"
            />
          </div>

          <div>
            <label className="block text-small font-semibold text-text-primary mb-1.5">
              Online Passkey
            </label>
            <input
              type="password"
              value={formData.passkey || ''}
              onChange={(e) => handleInputChange('passkey', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
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
      case 'inventory':
        return renderInventorySettings();
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
      case 'permissions':
        return <RolePermissionMatrix />;
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
      <div className="p-12 flex items-center justify-center bg-surface text-text-primary rounded-2xl border border-border-default">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-small text-text-muted">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-h1 font-bold text-text-primary tracking-tight">System Settings</h1>
        <p className="mt-1 text-small text-text-secondary">
          Manage system configurations, POS options, notifications, and security preferences.
        </p>
      </div>

      {/* Status Messages */}
      {saveStatus === 'success' && (
        <div className="p-4 bg-success-muted border border-success-border rounded-2xl flex items-center gap-3 text-success-text text-small shadow-2xs">
          <CheckIcon className="h-5 w-5 shrink-0 text-success" />
          <span className="font-semibold">Settings saved successfully!</span>
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="p-4 bg-danger-muted border border-danger-border rounded-2xl flex items-center gap-3 text-danger-text text-small shadow-2xs">
          <XMarkIcon className="h-5 w-5 shrink-0 text-danger" />
          <span className="font-semibold">Failed to save settings. Please try again.</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-danger-muted border border-danger-border rounded-2xl flex items-center gap-3 text-danger-text text-small shadow-2xs">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-danger" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-surface border border-border-default rounded-2xl shadow-floating overflow-hidden">
        <div className="flex flex-col lg:flex-row min-h-[600px]">
          {/* Sidebar Tabs */}
          <div className="w-full lg:w-64 bg-surface-2/40 border-b lg:border-b-0 lg:border-r border-border-default shrink-0 p-3">
            <nav className="space-y-1 flex lg:flex-col overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-none">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-small rounded-xl transition-all duration-150 whitespace-nowrap lg:whitespace-normal ${
                      isActive
                        ? 'bg-primary text-white font-semibold shadow-2xs'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface font-medium'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white' : 'text-text-muted'}`} />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main Content Pane */}
          <div className="flex-1 p-6 sm:p-8 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="border-b border-border-default pb-4">
                <h2 className="text-h2 font-semibold text-text-primary">
                  {tabs.find(tab => tab.id === activeTab)?.name} Settings
                </h2>
                <p className="text-small text-text-muted mt-0.5">
                  Configure your {tabs.find(tab => tab.id === activeTab)?.name.toLowerCase()} preferences
                </p>
              </div>

              {renderTabContent()}
            </div>

            {/* Action Footer Buttons */}
            <div className="mt-8 pt-6 border-t border-border-default flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-xl text-small font-semibold text-danger bg-danger-muted border border-danger-border hover:bg-danger/10 transition-all shadow-2xs"
              >
                Reset to Defaults
              </button>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setFormData(settings);
                    setHasChanges(false);
                  }}
                  disabled={!hasChanges}
                  className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-xl text-small font-semibold text-text-primary bg-surface border border-border-default hover:bg-surface-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || saveStatus === 'saving'}
                  className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-xl text-small font-semibold text-white bg-primary hover:bg-primary-hover active:bg-primary-active transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative mx-auto p-6 border w-full max-w-md shadow-modal rounded-2xl bg-surface border-border-default">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-2xl bg-danger-muted border border-danger-border">
                <ExclamationTriangleIcon className="h-6 w-6 text-danger" />
              </div>
              <h3 className="text-h3 font-semibold text-text-primary mt-4">
                Reset Settings
              </h3>
              <div className="mt-2 px-2 py-1">
                <p className="text-small text-text-secondary">
                  Are you sure you want to reset all settings to their default values? This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="h-10 px-4 inline-flex items-center justify-center rounded-xl text-small font-semibold text-text-primary bg-surface border border-border-default hover:bg-surface-2 transition-all shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-10 px-4 inline-flex items-center justify-center rounded-xl text-small font-semibold text-white bg-danger hover:bg-danger/90 transition-all shadow-sm"
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



