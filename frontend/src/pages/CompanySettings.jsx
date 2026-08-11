import { useEffect, useRef, useState } from 'react'
import { shopAPI, settingsAPI } from '../services/api'
import { Tab } from '@headlessui/react'
import { CogIcon, PaintBrushIcon, GlobeAltIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'

export default function CompanySettings() {
  const [companyForm, setCompanyForm] = useState({ name: '', address: '', phone: '', kraPin: '', registrationNumber: '' })
  const [themeForm, setThemeForm] = useState({ 
    theme: 'light',
    primaryColor: '#3B82F6',
    sidebarStyle: 'expanded',
  })
  const [regionalForm, setRegionalForm] = useState({
    currency: 'USD',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
  })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    (async () => {
      try {
        setError(null)
        const res = await shopAPI.getMine()
        if (!mountedRef.current) return
        const data = res?.data || {}
        setCompanyForm({ 
          name: data.name || '', 
          address: data.address || '', 
          phone: data.phone || '',
          kraPin: data.kraPin || '',
          registrationNumber: data.registrationNumber || ''
        })
        // In a real app, these would be fetched from the API
        setThemeForm(data.theme || themeForm)
        setRegionalForm(data.regional || regionalForm)
      } catch (e) {
        if (!mountedRef.current) return
        setError(e?.response?.data?.message || e?.message || 'Failed to load company settings. Please try again.')
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    })()
  }, [])

  const onCompanyChange = (e) => setCompanyForm({ ...companyForm, [e.target.name]: e.target.value })
  const onThemeChange = (e) => setThemeForm({ ...themeForm, [e.target.name]: e.target.value })
  const onRegionalChange = (e) => setRegionalForm({ ...regionalForm, [e.target.name]: e.target.value })

  const saveCompanySettings = async (e) => {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      await shopAPI.updateMine(companyForm)
      if (!mountedRef.current) return
      setMessage('Company details saved')
    } catch (e) {
      if (!mountedRef.current) return
      setError(e?.response?.data?.message || e?.message || 'Failed to save company details')
    }
  }

  const saveThemeSettings = async (e) => {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      await settingsAPI.updateTheme(themeForm)
      if (!mountedRef.current) return
      setMessage('Theme settings saved')
    } catch (e) {
      if (!mountedRef.current) return
      setError(e?.response?.data?.message || e?.message || 'Failed to save theme settings')
    }
  }

  const saveRegionalSettings = async (e) => {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      await settingsAPI.updateRegional(regionalForm)
      if (!mountedRef.current) return
      setMessage('Regional settings saved')
    } catch (e) {
      if (!mountedRef.current) return
      setError(e?.response?.data?.message || e?.message || 'Failed to save regional settings')
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  )

  const tabItems = [
    { name: 'Company Details', icon: BuildingOfficeIcon },
    { name: 'Theme', icon: PaintBrushIcon },
    { name: 'Regional', icon: GlobeAltIcon },
    { name: 'System', icon: CogIcon },
  ]

  return (
    <div className="max-w-4xl mx-auto">
      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between">
          <div>{error}</div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.location.reload()} className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700">Retry</button>
            <button onClick={() => setError(null)} className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100">Dismiss</button>
          </div>
        </div>
      )}
      <Tab.Group>
        <div className="bg-white rounded-lg shadow">
          <Tab.List className="flex p-1 space-x-1 border-b">
            {tabItems.map((item) => (
              <Tab
                key={item.name}
                className={({ selected }) =>
                  `flex items-center px-4 py-2.5 text-sm font-medium leading-5 text-gray-700
                   ${selected ? 'border-b-2 border-blue-600 text-blue-600' : 'hover:text-gray-900'}
                   focus:outline-none`
                }
              >
                <item.icon className="w-5 h-5 mr-2" />
                {item.name}
              </Tab>
            ))}
          </Tab.List>

          <Tab.Panels className="p-6">
            <Tab.Panel>
              <form onSubmit={saveCompanySettings} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Company Name</label>
                  <input
                    name="name"
                    value={companyForm.name}
                    onChange={onCompanyChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phone</label>
                  <input
                    name="phone"
                    value={companyForm.phone}
                    onChange={onCompanyChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <input
                    name="address"
                    value={companyForm.address}
                    onChange={onCompanyChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">KRA PIN</label>
                  <input
                    name="kraPin"
                    value={companyForm.kraPin}
                    onChange={onCompanyChange}
                    placeholder="e.g. A012345678Z"
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Business Registration Number</label>
                  <input
                    name="registrationNumber"
                    value={companyForm.registrationNumber}
                    onChange={onCompanyChange}
                    placeholder="e.g. CPR/2023/12345"
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Save Company Details
                  </button>
                </div>
              </form>
            </Tab.Panel>

            <Tab.Panel>
              <form onSubmit={saveThemeSettings} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">Theme Mode</label>
                  <select
                    name="theme"
                    value={themeForm.theme}
                    onChange={onThemeChange}
                    className="mt-1 w-full border border-brand-yellow/20 bg-brand-gray text-gray-200 rounded-md px-3 py-2"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Primary Color</label>
                  <div className="flex items-center mt-1 space-x-2">
                    <input
                      type="color"
                      name="primaryColor"
                      value={themeForm.primaryColor}
                      onChange={onThemeChange}
                      className="h-10 w-20"
                    />
                    <input
                      type="text"
                      name="primaryColor"
                      value={themeForm.primaryColor}
                      onChange={onThemeChange}
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Sidebar Style</label>
                  <select
                    name="sidebarStyle"
                    value={themeForm.sidebarStyle}
                    onChange={onThemeChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="expanded">Expanded</option>
                    <option value="collapsed">Collapsed</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Save Theme Settings
                  </button>
                </div>
              </form>
            </Tab.Panel>

            <Tab.Panel>
              <form onSubmit={saveRegionalSettings} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Currency</label>
                  <select
                    name="currency"
                    value={regionalForm.currency}
                    onChange={onRegionalChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="KES">KES - Kenyan Shilling</option>
                    <option value="NGN">NGN - Nigerian Naira</option>
                    <option value="ZAR">ZAR - South African Rand</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Timezone</label>
                  <select
                    name="timezone"
                    value={regionalForm.timezone}
                    onChange={onRegionalChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="UTC">UTC</option>
                    <option value="Africa/Nairobi">Africa/Nairobi</option>
                    <option value="Africa/Lagos">Africa/Lagos</option>
                    <option value="Africa/Cairo">Africa/Cairo</option>
                    <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date Format</label>
                  <select
                    name="dateFormat"
                    value={regionalForm.dateFormat}
                    onChange={onRegionalChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Language</label>
                  <select
                    name="language"
                    value={regionalForm.language}
                    onChange={onRegionalChange}
                    className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="sw">Swahili</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Save Regional Settings
                  </button>
                </div>
              </form>
            </Tab.Panel>

            <Tab.Panel>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">System Information</h3>
                  <div className="mt-2 text-sm text-gray-600">
                    <p>Version: 1.0.0</p>
                    <p>Last Updated: {new Date().toLocaleDateString()}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Storage Usage</h3>
                  <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '45%' }}></div>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">450MB of 1GB used</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900">Actions</h3>
                  <div className="mt-2 space-y-2">
                    <button className="w-full px-4 py-2 text-left border border-gray-300 rounded hover:bg-gray-50">
                      Export All Data
                    </button>
                    <button className="w-full px-4 py-2 text-left border border-gray-300 rounded hover:bg-gray-50">
                      Clear Cache
                    </button>
                    <button className="w-full px-4 py-2 text-left text-red-600 border border-red-300 rounded hover:bg-red-50">
                      Reset All Settings
                    </button>
                  </div>
                </div>
              </div>
            </Tab.Panel>
          </Tab.Panels>
        </div>
      </Tab.Group>

      {message && (
        <div className="mt-4 p-4 bg-green-100 text-green-700 rounded-md">
          {message}
        </div>
      )}
    </div>
  )
}


