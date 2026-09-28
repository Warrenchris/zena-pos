import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { authAPI } from '../services/api';
import { getCurrentUser } from '../store/slices/authSlice';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, token: authToken } = useSelector((state) => state.auth);

  const token = searchParams.get('token');

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function verify() {
      if (!token) {
        setStatus('error');
        setErrorMessage('No verification token provided in URL.');
        return;
      }

      try {
        await authAPI.verifyEmail(token);
        if (!isMounted) return;
        setStatus('success');

        // If authenticated, refresh profile in Redux so emailVerified becomes true immediately
        if (authToken) {
          dispatch(getCurrentUser());
        }
      } catch (err) {
        if (!isMounted) return;
        setStatus('error');
        setErrorMessage(
          err.response?.data?.error || 'This verification link is invalid, expired, or has already been used.'
        );
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token, authToken, dispatch]);

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setResendStatus(null);

    try {
      await authAPI.resendVerification();
      setResendStatus({ type: 'success', message: 'A new verification link has been sent to your email.' });
    } catch (err) {
      setResendStatus({
        type: 'error',
        message: err.response?.data?.error || 'Failed to resend verification email.'
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <EnvelopeIcon className="w-6 h-6 text-white" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-title-large font-bold tracking-tight text-text-primary">
          Email Verification
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-surface-2 py-8 px-6 sm:px-10 shadow-xl rounded-2xl border border-border-default">
          {status === 'verifying' && (
            <div id="verify-loading-state" className="text-center py-6">
              <ArrowPathIcon className="w-12 h-12 text-primary animate-spin mx-auto" />
              <h3 className="mt-4 text-base font-semibold text-text-primary">
                Verifying your email...
              </h3>
              <p className="mt-2 text-small text-text-muted">
                Please wait while we confirm your email address.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div id="verify-success-state" className="text-center py-4">
              <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-400">
                <CheckCircleIcon className="w-10 h-10" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-text-primary">
                Email Verified Successfully!
              </h3>
              <p className="mt-2 text-small text-text-muted">
                Your email address has been verified. You now have unrestricted access to all features and settings.
              </p>

              <div className="mt-6 space-y-3">
                {authToken ? (
                  <Link
                    id="verify-continue-btn"
                    to="/dashboard"
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-small font-semibold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 transition-all"
                  >
                    Continue to Dashboard
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                ) : (
                  <Link
                    id="verify-login-btn"
                    to="/login"
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-small font-semibold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 transition-all"
                  >
                    Log In to Your Account
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div id="verify-error-state" className="text-center py-4">
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
                <XCircleIcon className="w-10 h-10" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-text-primary">
                Verification Failed
              </h3>
              <p className="mt-2 text-small text-red-600 dark:text-red-400">
                {errorMessage}
              </p>
              <p className="mt-1 text-caption text-text-muted">
                The verification token may be expired or already used. Verification links expire after 24 hours.
              </p>

              {resendStatus && (
                <div
                  className={`mt-4 p-3 rounded-xl text-xs ${
                    resendStatus.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20'
                  }`}
                >
                  {resendStatus.message}
                </div>
              )}

              <div className="mt-6 space-y-3">
                {authToken && (
                  <button
                    id="verify-resend-btn"
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-small font-semibold text-white bg-primary hover:bg-primary-hover shadow-md shadow-primary/20 transition-all disabled:opacity-50"
                  >
                    {resending ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        Resending...
                      </>
                    ) : (
                      'Request New Verification Email'
                    )}
                  </button>
                )}

                <Link
                  to={authToken ? '/dashboard' : '/login'}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-small font-semibold text-text-secondary bg-surface-3 hover:bg-surface-3/80 transition-all border border-border-default"
                >
                  {authToken ? 'Back to Dashboard' : 'Back to Login'}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
