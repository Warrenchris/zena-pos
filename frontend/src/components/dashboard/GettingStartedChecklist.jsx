import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  CheckCircleIcon,
  TagIcon,
  Cog6ToothIcon,
  UsersIcon,
  ArrowRightIcon,
  XMarkIcon,
  SparklesIcon,
  ChartBarSquareIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import Card from '../ui/Card';
import Button from '../ui/Button';

/**
 * GettingStartedChecklist Component
 *
 * Provides a guided onboarding checklist for new store tenants when
 * products.length === 0 && sales.length === 0.
 *
 * Features:
 * 1. 3 action items: Add Products (-> /products/create), Configure Settings & Taxes (-> /settings), Add Staff Members (-> /employees).
 * 2. Real-data completion progress ("X of 3 steps completed") backed by store state.
 * 3. Scoped organization dismissal controlled via onDismiss prop.
 * 4. Manual toggle to preview standard dashboard.
 */
export default function GettingStartedChecklist({
  products = [],
  employees = [],
  user = null,
  shop = null,
  onDismiss,
  onToggleStandardView,
}) {
  const navigate = useNavigate();
  const settings = useSelector((state) => state.settings);

  const effectiveShop = shop || user?.shop;

  // Step 1: Add Products (real-data check: products.length > 0)
  const isProductsCompleted = Array.isArray(products) && products.length > 0;

  // Step 2: Configure Settings & Taxes (real-data check: shop or settings configured)
  const isSettingsCompleted = Boolean(
    effectiveShop?.kraPin ||
    effectiveShop?.address ||
    effectiveShop?.phone ||
    settings?.contactEmail ||
    (settings?.taxRate !== undefined && settings?.taxRate > 0) ||
    (settings?.receiptHeader && settings?.receiptHeader.length > 0)
  );

  // Step 3: Add Staff Members (real-data check: additional employees/cashiers present)
  const isStaffCompleted = Boolean(
    Array.isArray(employees) &&
    (employees.length > 1 ||
      employees.some(
        (e) => (e.role && e.role !== 'admin') || String(e.id) !== String(user?.id)
      ))
  );

  const steps = [
    {
      id: 'products',
      title: 'Add Your First Product',
      description: 'Set up your catalog items, unit prices, and initial stock quantities to start checkout.',
      route: '/products/create',
      isCompleted: isProductsCompleted,
      actionLabel: isProductsCompleted ? 'View Products' : 'Add Product',
      icon: TagIcon,
      accentColor: 'text-primary bg-primary/10 border-primary/20',
    },
    {
      id: 'settings',
      title: 'Configure Store Settings & Taxes',
      description: 'Set your business contact details, default currency, receipt header, and VAT/tax rates.',
      route: '/settings',
      isCompleted: isSettingsCompleted,
      actionLabel: isSettingsCompleted ? 'Review Settings' : 'Configure Settings',
      icon: Cog6ToothIcon,
      accentColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    },
    {
      id: 'staff',
      title: 'Add Staff Members & Cashiers',
      description: 'Create user logins and permissions for your cashiers and store managers.',
      route: '/employees',
      isCompleted: isStaffCompleted,
      actionLabel: isStaffCompleted ? 'Manage Staff' : 'Add Staff Member',
      icon: UsersIcon,
      accentColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    },
  ];

  const completedCount = steps.filter((step) => step.isCompleted).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <div className="space-y-6">
      <Card variant="elevated" className="overflow-hidden border border-border-default shadow-floating">
        {/* Top Header Banner */}
        <div className="p-6 md:p-8 bg-gradient-to-r from-primary/10 via-surface to-surface border-b border-border-default">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-caption font-semibold bg-primary/15 text-primary border border-primary/25">
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>Store Setup Guide</span>
              </div>
              <h2 className="text-h2 font-bold text-text-primary tracking-tight">
                Welcome to Zana POS! Let's get your store ready.
              </h2>
              <p className="text-body text-text-secondary max-w-2xl">
                Complete these essential setup steps to start ringing up sales, managing inventory, and tracking performance.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
              {onToggleStandardView && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={ChartBarSquareIcon}
                  onClick={onToggleStandardView}
                  title="Explore standard dashboard charts"
                >
                  View Standard Dashboard
                </Button>
              )}
              {onDismiss && (
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                  title="Dismiss checklist"
                  aria-label="Dismiss checklist"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar & Counter */}
          <div className="mt-8 space-y-2.5">
            <div className="flex items-center justify-between text-small">
              <span className="font-semibold text-text-primary">
                {completedCount} of {steps.length} steps completed
              </span>
              <span className="font-bold text-primary">
                {progressPercent}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-surface-2 rounded-full overflow-hidden border border-border-default/60">
              <div
                className="h-full bg-gradient-to-r from-primary to-emerald-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {completedCount === steps.length && (
              <p className="text-caption text-emerald-600 dark:text-emerald-400 font-medium">
                🎉 Great job! You have completed all initial onboarding steps.
              </p>
            )}
          </div>
        </div>

        {/* Steps List */}
        <div className="divide-y divide-border-default/60 bg-surface">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  step.isCompleted ? 'bg-surface-2/20' : 'hover:bg-surface-2/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Status Indicator / Icon */}
                  <div className="mt-0.5 shrink-0">
                    {step.isCompleted ? (
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <CheckCircleIcon className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-small ${step.accentColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-caption font-semibold text-text-muted">
                        Step {index + 1}
                      </span>
                      <h3
                        className={`text-body font-semibold ${
                          step.isCompleted
                            ? 'text-text-secondary line-through decoration-text-muted/60'
                            : 'text-text-primary'
                        }`}
                      >
                        {step.title}
                      </h3>
                      {step.isCompleted && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Completed
                        </span>
                      )}
                    </div>
                    <p className="text-caption text-text-secondary max-w-xl">
                      {step.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    size="sm"
                    variant={step.isCompleted ? 'secondary' : 'primary'}
                    rightIcon={step.isCompleted ? ArrowTopRightOnSquareIcon : ArrowRightIcon}
                    onClick={() => navigate(step.route)}
                  >
                    {step.actionLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer info & toggle note */}
        <div className="p-4 px-6 bg-surface-2/40 border-t border-border-default flex flex-col sm:flex-row items-center justify-between gap-3 text-caption text-text-muted">
          <span>
            Dismissing this guide hides it for this organization. You can reopen it anytime from the top bar.
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            className="hover:text-text-primary transition-colors underline decoration-dotted shrink-0"
          >
            Dismiss guide
          </button>
        </div>
      </Card>
    </div>
  );
}
