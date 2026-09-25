import React, { useEffect, useRef, useState } from 'react'
import { shopAPI } from '../services/api'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import {
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  PhoneIcon,
  MapPinIcon,
  IdentificationIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

export default function CompanySettings() {
  const [companyForm, setCompanyForm] = useState({
    name: '',
    address: '',
    phone: '',
    kraPin: '',
    registrationNumber: ''
  })
  const [initialForm, setInitialForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchCompanyDetails = async () => {
    try {
      setError(null)
      const res = await shopAPI.getMine()
      if (!mountedRef.current) return
      const data = res?.data || {}
      const loaded = {
        name: data.name || '',
        address: data.address || '',
        phone: data.phone || '',
        kraPin: data.kraPin || '',
        registrationNumber: data.registrationNumber || ''
      }
      setCompanyForm(loaded)
      setInitialForm(loaded)
    } catch (e) {
      if (!mountedRef.current) return
      setError(e?.response?.data?.message || e?.message || 'Failed to load company settings. Please try again.')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanyDetails()
  }, [])

  const onCompanyChange = (e) => {
    setCompanyForm({ ...companyForm, [e.target.name]: e.target.value })
  }

  const handleReset = () => {
    if (initialForm) {
      setCompanyForm(initialForm)
      setMessage(null)
      setError(null)
    }
  }

  const saveCompanySettings = async (e) => {
    e.preventDefault()
    setMessage(null)
    setError(null)
    setSaving(true)
    try {
      await shopAPI.updateMine(companyForm)
      if (!mountedRef.current) return
      setInitialForm({ ...companyForm })
      setMessage('Company details saved')
      setTimeout(() => {
        if (mountedRef.current) setMessage(null)
      }, 5000)
    } catch (e) {
      if (!mountedRef.current) return
      setError(e?.response?.data?.message || e?.message || 'Failed to save company details')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  const hasChanges = initialForm && (
    companyForm.name !== initialForm.name ||
    companyForm.address !== initialForm.address ||
    companyForm.phone !== initialForm.phone ||
    companyForm.kraPin !== initialForm.kraPin ||
    companyForm.registrationNumber !== initialForm.registrationNumber
  )

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-4">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-surface-2 rounded-xl w-48"></div>
          <div className="h-4 bg-surface-2 rounded-lg w-80"></div>
          <div className="bg-surface rounded-2xl border border-border-default p-8 space-y-6">
            <div className="h-10 bg-surface-2 rounded-xl w-full"></div>
            <div className="h-10 bg-surface-2 rounded-xl w-full"></div>
            <div className="h-10 bg-surface-2 rounded-xl w-full"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Page Header */}
      <PageHeader
        title="Company Profile"
        description="Manage your business legal details, tax identification, and official customer-facing information."
        breadcrumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Company Profile' }
        ]}
      />

      {/* Error Alert */}
      {error && (
        <div className="mb-6 rounded-xl border border-danger-border bg-danger-muted p-4 text-small text-danger-text flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <ExclamationCircleIcon className="h-5 w-5 text-danger shrink-0" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchCompanyDetails}
              className="px-3 py-1.5 rounded-lg text-caption font-semibold bg-danger text-white hover:bg-red-700 transition-colors inline-flex items-center gap-1.5"
            >
              <ArrowPathIcon className="h-3.5 w-3.5" />
              Retry
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="px-3 py-1.5 rounded-lg text-caption font-semibold border border-danger-border text-danger-text hover:bg-danger-muted/80 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {message && (
        <div className="mb-6 rounded-xl border border-success-border bg-success-muted p-4 text-small text-success-text flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-3">
            <CheckCircleIcon className="h-5 w-5 text-success-text shrink-0" />
            <span className="font-medium">{message}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-success-text hover:opacity-75 transition-opacity"
            aria-label="Dismiss message"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-surface rounded-2xl border border-border-default shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="px-6 py-5 sm:px-8 border-b border-border-default bg-surface flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <BuildingOfficeIcon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-h3 font-semibold text-text-primary">Company Details</h2>
            <p className="text-caption text-text-secondary mt-0.5">
              Printed on customer receipts, invoices, and reports
            </p>
          </div>
        </div>

        {/* Card Form */}
        <form onSubmit={saveCompanySettings} className="p-6 sm:p-8 space-y-6">
          {/* General Information */}
          <div className="space-y-4">
            <h3 className="text-small font-bold text-text-secondary uppercase tracking-wider">
              General Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Company Name */}
              <div className="md:col-span-2">
                <label className="block text-small font-semibold text-text-primary mb-1.5">
                  Company Name <span className="text-danger">*</span>
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <BuildingStorefrontIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    name="name"
                    required
                    value={companyForm.name}
                    onChange={onCompanyChange}
                    placeholder="e.g. Realmer Technology Limited"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border-default bg-surface-2 text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-small font-semibold text-text-primary mb-1.5">
                  Phone Number
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <PhoneIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="tel"
                    name="phone"
                    value={companyForm.phone}
                    onChange={onCompanyChange}
                    placeholder="e.g. +254 700 000 000"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border-default bg-surface-2 text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-small font-semibold text-text-primary mb-1.5">
                  Physical Address
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <MapPinIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    name="address"
                    value={companyForm.address}
                    onChange={onCompanyChange}
                    placeholder="e.g. Moi Avenue, Nairobi"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border-default bg-surface-2 text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border-default pt-6 space-y-4">
            <h3 className="text-small font-bold text-text-secondary uppercase tracking-wider">
              Legal & Tax Compliance
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* KRA PIN */}
              <div>
                <label className="block text-small font-semibold text-text-primary mb-1.5">
                  KRA PIN
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <IdentificationIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    name="kraPin"
                    value={companyForm.kraPin}
                    onChange={onCompanyChange}
                    placeholder="e.g. A012345678Z"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border-default bg-surface-2 text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary uppercase transition-all"
                  />
                </div>
                <p className="mt-1.5 text-caption text-text-muted">
                  Official tax identification number.
                </p>
              </div>

              {/* Business Registration Number */}
              <div>
                <label className="block text-small font-semibold text-text-primary mb-1.5">
                  Business Registration Number
                </label>
                <div className="relative rounded-xl">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <DocumentTextIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    name="registrationNumber"
                    value={companyForm.registrationNumber}
                    onChange={onCompanyChange}
                    placeholder="e.g. CPR/2023/12345"
                    className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-border-default bg-surface-2 text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
                <p className="mt-1.5 text-caption text-text-muted">
                  Official registered business or certificate number.
                </p>
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="border-t border-border-default pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-caption text-text-muted order-2 sm:order-1">
              {hasChanges ? (
                <span className="text-amber-500 dark:text-amber-400 font-medium">
                  ● You have unsaved changes
                </span>
              ) : (
                <span>All company information is up to date</span>
              )}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end order-1 sm:order-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleReset}
                disabled={!hasChanges || saving}
              >
                Discard
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={saving}
                leftIcon={CheckCircleIcon}
              >
                Save Company Details
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
