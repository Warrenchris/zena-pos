import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { ExclamationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import { toast } from '../../utils/toast';

export default function OrgLifecycleModal({
  isOpen,
  onClose,
  org,
  subscription,
  actionType,
  onSuccess
}) {
  const [reason, setReason] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [touched, setTouched] = useState(false);

  // Tomorrow string (min date) and 400 days limit
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateStr = tomorrow.toISOString().split('T')[0];

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 395);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  const isGrandfathered = subscription?.plan?.code === 'grandfathered';
  const isPeriodLapsed = subscription?.currentPeriodEnd && new Date(subscription.currentPeriodEnd) <= new Date();
  const requiresNewPeriodEnd = actionType === 'reactivate' && !isGrandfathered && Boolean(isPeriodLapsed);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setNewPeriodEnd('');
      setLoading(false);
      setServerError(null);
      setTouched(false);
    }
  }, [isOpen, actionType]);

  const trimmedReason = reason.trim();
  const isReasonValid = trimmedReason.length >= 10 && trimmedReason.length <= 500;
  const isDateValid = !requiresNewPeriodEnd || Boolean(newPeriodEnd);
  const isFormValid = isReasonValid && isDateValid;

  const getActionConfig = () => {
    switch (actionType) {
      case 'suspend':
        return {
          title: 'Suspend Organization',
          description: 'Place this tenant organization and its subscription on manual platform hold.',
          confirmText: 'Suspend Organization',
          buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white disabled:bg-amber-600/50',
          toastSuccess: 'Organization suspended successfully.'
        };
      case 'deactivate':
        return {
          title: 'Deactivate Organization',
          description: 'Cancel subscription entitlements and lock tenant operations with platform hold.',
          confirmText: 'Deactivate Organization',
          buttonClass: 'bg-danger hover:bg-danger-hover text-white disabled:bg-danger/50',
          toastSuccess: 'Organization deactivated successfully.'
        };
      case 'reactivate':
        return {
          title: 'Reactivate Organization',
          description: 'Restore organization status to active and release the manual platform hold.',
          confirmText: 'Reactivate Organization',
          buttonClass: 'bg-primary hover:bg-primary-hover text-white disabled:bg-primary/50',
          toastSuccess: 'Organization reactivated successfully.'
        };
      default:
        return {
          title: 'Modify Organization Lifecycle',
          description: 'Change the operational lifecycle status of this organization.',
          confirmText: 'Confirm Action',
          buttonClass: 'bg-primary hover:bg-primary-hover text-white disabled:bg-primary/50',
          toastSuccess: 'Action processed successfully.'
        };
    }
  };

  const config = getActionConfig();

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setTouched(true);
    if (!isFormValid || loading) return;

    setLoading(true);
    setServerError(null);

    const payload = { reason: trimmedReason };
    if (requiresNewPeriodEnd && newPeriodEnd) {
      // Send as ISO string timestamp ending at end of day to safely validate future date in platform.js
      payload.newPeriodEnd = new Date(`${newPeriodEnd}T23:59:59Z`).toISOString();
    }

    try {
      if (actionType === 'suspend') {
        await platformAPI.suspendOrganization(org.id, payload);
      } else if (actionType === 'deactivate') {
        await platformAPI.deactivateOrganization(org.id, payload);
      } else if (actionType === 'reactivate') {
        await platformAPI.reactivateOrganization(org.id, payload);
      }

      toast.success(config.toastSuccess);
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      onClose();
    } catch (err) {
      const errorMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'An error occurred processing the lifecycle request.';
      setServerError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={config.title}
      description={config.description}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-text-primary font-medium text-small transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !isFormValid}
            className={`min-h-[44px] px-5 py-2 rounded-xl font-semibold text-small shadow-sm transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/40 ${config.buttonClass}`}
          >
            {loading && <Spinner size="sm" color="white" />}
            <span>{config.confirmText}</span>
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {serverError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-small flex items-start gap-2.5"
          >
            <ExclamationCircleIcon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="font-medium">{serverError}</span>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="lifecycle-reason"
              className="block text-small font-semibold text-text-primary"
            >
              Reason / Justification <span className="text-danger">*</span>
            </label>
            <span
              className={`text-caption font-mono ${
                trimmedReason.length > 0 && trimmedReason.length < 10
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-text-muted'
              }`}
            >
              {trimmedReason.length} / 500 chars (min 10)
            </span>
          </div>
          <textarea
            id="lifecycle-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="Document reason for compliance or audit review..."
            maxLength={500}
            className="w-full rounded-xl border border-border-default bg-surface px-3.5 py-2.5 text-text-primary text-small placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow resize-none"
          />
          {touched && !isReasonValid && (
            <p className="mt-1 text-caption text-danger flex items-center gap-1">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Reason must be between 10 and 500 characters.</span>
            </p>
          )}
        </div>

        {requiresNewPeriodEnd && (
          <div className="p-3.5 rounded-xl bg-surface-2 border border-border-default space-y-2">
            <label
              htmlFor="lifecycle-new-period-end"
              className="block text-small font-semibold text-text-primary"
            >
              New Subscription Period End Date <span className="text-danger">*</span>
            </label>
            <p className="text-caption text-text-secondary">
              The existing subscription period lapsed on{' '}
              <strong className="font-mono">
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </strong>
              . Choose a future billing date to reactivate the account.
            </p>
            <input
              type="date"
              id="lifecycle-new-period-end"
              min={minDateStr}
              max={maxDateStr}
              value={newPeriodEnd}
              onChange={(e) => setNewPeriodEnd(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-border-default bg-surface px-3 py-2 text-text-primary text-small focus:outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
            />
          </div>
        )}
      </form>
    </Modal>
  );
}
