import { useEffect, useRef, useState } from 'react';
import { shopAPI, settingsAPI } from '../services/api';
import { Tab } from '@headlessui/react';
import {
  CogIcon,
  PaintBrushIcon,
  GlobeAltIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useToast } from '../components/Toast';

export default function CompanySettings() {
  let toast = null;
  try {
    toast = useToast();
  } catch (_) {
    toast = null;
  }

  const showToast = (opts) => {
    if (toast?.showToast) {
      toast.showToast(opts);
    } else if (typeof window !== 'undefined' && window.showToast) {
      window.showToast(opts);
    }
  };

  const [companyForm, setCompanyForm] = useState({
    name: '',
    address: '',
    phone: '',
    kraPin: '',
    registrationNumber: '',
  });

  const [themeForm, setThemeForm] = useState({
    theme: 'light',
    primaryColor: '#F59E0B',
    sidebarStyle: 'expanded',
  });

  const [regionalForm, setRegionalForm] = useState({
    currency: 'USD',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
  });

  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingRegional, setSavingRegional] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const res = await shopAPI.getMine();
        if (!mountedRef.current) return;
        const data = res?.data || {};
        setCompanyForm({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          kraPin: data.kraPin || '',
          registrationNumber: data.registrationNumber || '',
        });
        if (data.theme) setThemeForm(data.theme);
        if (data.regional) setRegionalForm(data.regional);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(e?.response?.data?.message || e?.message || 'Failed to load company settings. Please try again.');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, []);

  const onCompanyChange = (e) => setCompanyForm({ ...companyForm, [e.target.name]: e.target.value });
  const onThemeChange = (e) => setThemeForm({ ...themeForm, [e.target.name]: e.target.value });
  const onRegionalChange = (e) => setRegionalForm({ ...regionalForm, [e.target.name]: e.target.value });

  const saveCompanySettings = async (e) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSavingCompany(true);
    try {
      await shopAPI.updateMine(companyForm);
      if (!mountedRef.current) return;
      setMessage('Company details saved successfully.');
      showToast({ type: 'success', title: 'Company Details', message: 'Company information updated successfully.' });
    } catch (e) {
      if (!mountedRef.current) return;
      const errMsg = e?.response?.data?.message || e?.message || 'Failed to save company details';
      setError(errMsg);
      showToast({ type: 'error', title: 'Error', message: errMsg });
    } finally {
      if (mountedRef.current) setSavingCompany(false);
    }
  };

  const saveThemeSettings = async (e) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSavingTheme(true);
    try {
      await settingsAPI.updateTheme(themeForm);
      if (!mountedRef.current) return;
      setMessage('Theme settings saved successfully.');
      showToast({ type: 'success', title: 'Theme Updated', message: 'Theme branding settings saved.' });
    } catch (e) {
      if (!mountedRef.current) return;
      const errMsg = e?.response?.data?.message || e?.message || 'Failed to save theme settings';
      setError(errMsg);
      showToast({ type: 'error', title: 'Error', message: errMsg });
    } finally {
      if (mountedRef.current) setSavingTheme(false);
    }
  };

  const saveRegionalSettings = async (e) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSavingRegional(true);
    try {
      await settingsAPI.updateRegional(regionalForm);
      if (!mountedRef.current) return;
      setMessage('Regional settings saved successfully.');
      showToast({ type: 'success', title: 'Regional Updated', message: 'Regional configuration saved.' });
    } catch (e) {
      if (!mountedRef.current) return;
      const errMsg = e?.response?.data?.message || e?.message || 'Failed to save regional settings';
      setError(errMsg);
      showToast({ type: 'error', title: 'Error', message: errMsg });
    } finally {
      if (mountedRef.current) setSavingRegional(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 pb-8">
        <PageHeader
          title="Company Profile"
          description="Manage your business information, branding, regional settings, and store details."
        />
        <div className="p-12 flex items-center justify-center bg-surface text-text-primary rounded-2xl border border-border-default">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-small text-text-muted">Loading company profile...</p>
          </div>
        </div>
      </div>
    );
  }

  const tabItems = [
    { name: 'Company Details', icon: BuildingOfficeIcon },
    { name: 'Theme', icon: PaintBrushIcon },
    { name: 'Regional', icon: GlobeAltIcon },
    { name: 'System', icon: CogIcon },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <PageHeader
        title="Company Profile"
        description="Manage your business information, branding, regional settings, and store details."
      />

      {error && (
        <div className="p-4 bg-danger-muted border border-danger-border rounded-2xl flex items-center justify-between gap-3 text-danger-text text-small shadow-2xs">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-danger" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-2.5 py-1 text-caption font-semibold rounded-lg bg-danger text-white hover:bg-danger/90 transition-colors"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-1 rounded-lg text-danger-text hover:bg-danger/10 transition-colors"
              title="Dismiss"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="p-4 bg-success-muted border border-success-border rounded-2xl flex items-center justify-between gap-3 text-success-text text-small shadow-2xs">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="h-5 w-5 shrink-0 text-success" />
            <span className="font-semibold">{message}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="p-1 rounded-lg text-success-text hover:bg-success/10 transition-colors"
            title="Dismiss"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card variant="default">
        <Tab.Group>
          <div className="border-b border-border-default/70 bg-surface-2/40 px-4 sm:px-6 pt-3">
            <Tab.List className="flex flex-wrap gap-1 -mb-px">
              {tabItems.map((item) => (
                <Tab
                  key={item.name}
                  className={({ selected }) =>
                    `flex items-center gap-2 px-4 py-2.5 border-b-2 text-small font-semibold transition-all duration-150 focus:outline-none ${
                      selected
                        ? 'border-primary text-primary'
                        : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-default'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </Tab>
              ))}
            </Tab.List>
          </div>

          <Tab.Panels className="p-6 sm:p-8">
            {/* Tab 1: Company Details */}
            <Tab.Panel>
              <form onSubmit={saveCompanySettings} className="space-y-6">
                <div className="border-b border-border-default/70 pb-4">
                  <h3 className="text-h3 font-semibold text-text-primary">Business Identity</h3>
                  <p className="text-small text-text-muted mt-0.5">
                    Official business details used on customer invoices, thermal receipts, and legal reports.
                  </p>
                </div>

                <div className="space-y-5">
                  <Input
                    label="Company Name"
                    name="name"
                    value={companyForm.name}
                    onChange={onCompanyChange}
                    placeholder="e.g. Realmer Technology Limited"
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <Input
                      label="Phone"
                      name="phone"
                      value={companyForm.phone}
                      onChange={onCompanyChange}
                      placeholder="e.g. 0742118572"
                    />

                    <Input
                      label="KRA PIN"
                      name="kraPin"
                      value={companyForm.kraPin}
                      onChange={onCompanyChange}
                      placeholder="e.g. A012345678Z"
                    />
                  </div>

                  <Input
                    label="Address"
                    name="address"
                    value={companyForm.address}
                    onChange={onCompanyChange}
                    placeholder="e.g. MOI AVENUE"
                  />

                  <Input
                    label="Business Registration Number"
                    name="registrationNumber"
                    value={companyForm.registrationNumber}
                    onChange={onCompanyChange}
                    placeholder="e.g. CPR/2023/12345"
                  />
                </div>

                <div className="flex justify-end pt-4 border-t border-border-default/70">
                  <Button type="submit" variant="primary" loading={savingCompany}>
                    Save Company Details
                  </Button>
                </div>
              </form>
            </Tab.Panel>

            {/* Tab 2: Theme Settings */}
            <Tab.Panel>
              <form onSubmit={saveThemeSettings} className="space-y-6">
                <div className="border-b border-border-default/70 pb-4">
                  <h3 className="text-h3 font-semibold text-text-primary">Appearance & Branding</h3>
                  <p className="text-small text-text-muted mt-0.5">
                    Customize interface color theme, dark/light mode, and navigation sidebar style.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-small font-semibold text-text-primary mb-1.5">
                      Theme Mode
                    </label>
                    <select
                      name="theme"
                      value={themeForm.theme}
                      onChange={onThemeChange}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    >
                      <option value="light" className="bg-surface text-text-primary">Light</option>
                      <option value="dark" className="bg-surface text-text-primary">Dark</option>
                      <option value="system" className="bg-surface text-text-primary">System</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-small font-semibold text-text-primary mb-1.5">
                      Sidebar Style
                    </label>
                    <select
                      name="sidebarStyle"
                      value={themeForm.sidebarStyle}
                      onChange={onThemeChange}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    >
                      <option value="expanded" className="bg-surface text-text-primary">Expanded (Full)</option>
                      <option value="collapsed" className="bg-surface text-text-primary">Collapsed (Icons only)</option>
                      <option value="hidden" className="bg-surface text-text-primary">Hidden</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-small font-semibold text-text-primary mb-1.5">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      name="primaryColor"
                      value={themeForm.primaryColor}
                      onChange={onThemeChange}
                      className="h-10 w-14 rounded-xl border border-border-default cursor-pointer bg-surface p-1 shadow-2xs"
                    />
                    <input
                      type="text"
                      name="primaryColor"
                      value={themeForm.primaryColor}
                      onChange={onThemeChange}
                      className="w-48 px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      placeholder="#F59E0B"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-border-default/70">
                  <Button type="submit" variant="primary" loading={savingTheme}>
                    Save Theme Settings
                  </Button>
                </div>
              </form>
            </Tab.Panel>

            {/* Tab 3: Regional Settings */}
            <Tab.Panel>
              <form onSubmit={saveRegionalSettings} className="space-y-6">
                <div className="border-b border-border-default/70 pb-4">
                  <h3 className="text-h3 font-semibold text-text-primary">Regional & Localization</h3>
                  <p className="text-small text-text-muted mt-0.5">
                    Configure default currency, timezone, date formatting, and system language.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-small font-semibold text-text-primary mb-1.5">
                      Currency
                    </label>
                    <select
                      name="currency"
                      value={regionalForm.currency}
                      onChange={onRegionalChange}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    >
                      <option value="USD" className="bg-surface text-text-primary">USD - US Dollar ($)</option>
                      <option value="EUR" className="bg-surface text-text-primary">EUR - Euro (€)</option>
                      <option value="GBP" className="bg-surface text-text-primary">GBP - British Pound (£)</option>
                      <option value="KES" className="bg-surface text-text-primary">KES - Kenyan Shilling (KSh)</option>
                      <option value="NGN" className="bg-surface text-text-primary">NGN - Nigerian Naira (₦)</option>
                      <option value="ZAR" className="bg-surface text-text-primary">ZAR - South African Rand (R)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-small font-semibold text-text-primary mb-1.5">
                      Timezone
                    </label>
                    <select
                      name="timezone"
                      value={regionalForm.timezone}
                      onChange={onRegionalChange}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    >
                      <option value="UTC" className="bg-surface text-text-primary">UTC</option>
                      <option value="Africa/Nairobi" className="bg-surface text-text-primary">Africa/Nairobi (EAT, UTC+3)</option>
                      <option value="Africa/Lagos" className="bg-surface text-text-primary">Africa/Lagos (WAT, UTC+1)</option>
                      <option value="Africa/Cairo" className="bg-surface text-text-primary">Africa/Cairo (EET, UTC+2)</option>
                      <option value="Africa/Johannesburg" className="bg-surface text-text-primary">Africa/Johannesburg (SAST, UTC+2)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-small font-semibold text-text-primary mb-1.5">
                      Date Format
                    </label>
                    <select
                      name="dateFormat"
                      value={regionalForm.dateFormat}
                      onChange={onRegionalChange}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    >
                      <option value="MM/DD/YYYY" className="bg-surface text-text-primary">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY" className="bg-surface text-text-primary">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD" className="bg-surface text-text-primary">YYYY-MM-DD</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-small font-semibold text-text-primary mb-1.5">
                      Language
                    </label>
                    <select
                      name="language"
                      value={regionalForm.language}
                      onChange={onRegionalChange}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    >
                      <option value="en" className="bg-surface text-text-primary">English</option>
                      <option value="fr" className="bg-surface text-text-primary">French</option>
                      <option value="sw" className="bg-surface text-text-primary">Swahili</option>
                      <option value="ar" className="bg-surface text-text-primary">Arabic</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-border-default/70">
                  <Button type="submit" variant="primary" loading={savingRegional}>
                    Save Regional Settings
                  </Button>
                </div>
              </form>
            </Tab.Panel>

            {/* Tab 4: System Information */}
            <Tab.Panel>
              <div className="space-y-6">
                <div className="border-b border-border-default/70 pb-4">
                  <h3 className="text-h3 font-semibold text-text-primary">System Information</h3>
                  <p className="text-small text-text-muted mt-0.5">
                    Platform specifications, cloud storage metrics, and diagnostics.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="p-4 rounded-xl border border-border-default bg-surface-2/40">
                    <h4 className="text-small font-semibold text-text-primary">Application Version</h4>
                    <p className="text-h3 font-bold text-primary mt-1">v1.0.0 (Enterprise)</p>
                    <p className="text-caption text-text-muted mt-1">Last synced: {new Date().toLocaleDateString()}</p>
                  </div>

                  <div className="p-4 rounded-xl border border-border-default bg-surface-2/40">
                    <div className="flex justify-between items-center">
                      <h4 className="text-small font-semibold text-text-primary">Storage Usage</h4>
                      <span className="text-caption font-semibold text-text-secondary">45%</span>
                    </div>
                    <div className="w-full bg-surface-3 rounded-full h-2 mt-3 overflow-hidden">
                      <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: '45%' }}></div>
                    </div>
                    <p className="text-caption text-text-muted mt-2">450MB of 1GB used</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-small font-semibold text-text-primary">Actions</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button variant="secondary" className="w-full justify-center">
                      Export All Data
                    </Button>
                    <Button variant="secondary" className="w-full justify-center">
                      Clear Cache
                    </Button>
                    <Button variant="danger" className="w-full justify-center">
                      Reset All Settings
                    </Button>
                  </div>
                </div>
              </div>
            </Tab.Panel>
          </Tab.Panels>
        </Tab.Group>
      </Card>
    </div>
  );
}
