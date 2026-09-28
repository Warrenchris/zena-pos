import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  EnvelopeIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { authAPI } from '../services/api';

/**
 * EmailVerificationBanner
 *
 * Globally visible, dismissible notice for unverified organization owners.
 * Shows days remaining in the 7-day grace period before full app access is locked.
 * Features a direct "Resend email" action with a 60s cooldown timer.
 */
export default function EmailVerificationBanner() {
  const { user } = useSelector((state) => state.auth);

  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('zana_email_banner_dismissed') === 'true';
    }
    return false;
  });

  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Re-open banner if an EMAIL_NOT_VERIFIED or EMAIL_VERIFICATION_REQUIRED 403 occurs
  useEffect(() => {
    const handleRequired = () => {
      setIsDismissed(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('zana_email_banner_dismissed');
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('email-verification-required', handleRequired);
      return () => window.removeEventListener('email-verification-required', handleRequired);
    }
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Only render for owners who are unverified
  const isOwner = user?.orgRole === 'owner';
  const isUnverified = user && !user.isEmployee && (user.emailVerified === false || (!user.emailVerified && !user.emailVerifiedAt));

  if (!isOwner || !isUnverified || isDismissed) {
    return null;
  }

  // Calculate days remaining until 7-day hard gate
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const createdAtMs = user?.createdAt ? new Date(user.createdAt).getTime() : Date.now();
  const elapsedMs = Date.now() - createdAtMs;
  const remainingMs = Math.max(0, SEVEN_DAYS_MS - elapsedMs);
  const daysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  const isExpired = remainingMs === 0;

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('zana_email_banner_dismissed', 'true');
    }
  };

  const handleResend = async () => {
    if (resending || cooldownSeconds > 0) return;
    setResending(true);
    setResendError(null);
    setResendSuccess(false);

    try {
      const res = await authAPI.resendVerification();
      setResendSuccess(true);
      setCooldownSeconds(60);
      if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast({
          type: 'success',
          title: 'Verification Email Sent',
          message: 'A fresh verification link has been sent to your email address.',
          duration: 5000
        });
      }
      setTimeout(() => setResendSuccess(false), 8000);
    } catch (err) {
      const status = err.response?.status;
      const retryAfter = err.response?.data?.retryAfter;
      if (status === 429) {
        const seconds = parseInt(retryAfter, 10) || 60;
        setCooldownSeconds(seconds);
        setResendError(err.response?.data?.error || `Please wait ${seconds}s before requesting again.`);
      } else {
        setResendError(err.response?.data?.error || 'Failed to resend verification email.');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      id="email-verification-banner"
      role="alert"
      className={`relative w-full border-b px-4 py-3 sm:px-6 transition-all duration-200 ${
        isExpired
          ? 'bg-red-500/10 border-red-500/30 text-red-900 dark:text-red-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 max-w-7xl mx-auto">
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          <div className={`p-1.5 rounded-lg flex-shrink-0 ${
            isExpired
              ? 'bg-red-500/20 text-red-600 dark:text-red-400'
              : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
          }`}>
            {isExpired ? (
              <ExclamationTriangleIcon className="w-5 h-5" aria-hidden="true" />
            ) : (
              <EnvelopeIcon className="w-5 h-5" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-caption uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                isExpired
                  ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
              }`}>
                {isExpired ? 'Action Required' : 'Verify Email'}
              </span>
              <span className="font-semibold text-small">
                {isExpired
                  ? 'Your 7-day grace period has expired'
                  : `Please verify your email address — ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`}
              </span>
            </div>
            <p className="text-caption mt-0.5 text-text-muted dark:text-text-secondary leading-snug">
              {isExpired
                ? 'Sensitive actions and routine workflows are currently restricted. Please click the link sent to your inbox to restore full access.'
                : 'Sensitive operations (staff creation, billing, M-Pesa setup) are restricted until your email address is verified.'}
            </p>
            {resendError && (
              <p className="text-caption text-red-600 dark:text-red-400 font-medium mt-1">
                {resendError}
              </p>
            )}
            {resendSuccess && (
              <p className="text-caption text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                <CheckCircleIcon className="w-4 h-4 inline-block" />
                Verification email dispatched! Please check your spam folder if it doesn't arrive within 2 minutes.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
          <button
            id="resend-verification-button"
            type="button"
            onClick={handleResend}
            disabled={resending || cooldownSeconds > 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isExpired
                ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:opacity-50'
                : 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500 disabled:opacity-50'
            }`}
          >
            {resending ? (
              <>
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                Sending...
              </>
            ) : cooldownSeconds > 0 ? (
              `Resend in ${cooldownSeconds}s`
            ) : (
              'Resend Email'
            )}
          </button>

          <button
            id="dismiss-email-banner-button"
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss banner for this session"
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
