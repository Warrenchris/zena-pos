import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { ShieldExclamationIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

/**
 * PlatformHoldBanner
 *
 * Prominent banner displayed to tenant owners when their organization has been
 * placed on platform hold (manualHold === true and suspended or canceled).
 * Uses the subscription data already loaded by the billing store and listens to
 * the 'platform-hold' CustomEvent dispatched by api.js on 403 / 409 responses.
 * Performs NO independent network requests.
 */
export default function PlatformHoldBanner() {
  const { user } = useSelector((state) => state.auth);
  const { subscription } = useSelector((state) => state.billing);
  const [eventData, setEventData] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHoldEvent = (e) => {
      if (e?.detail) {
        setEventData(e.detail);
      }
    };

    window.addEventListener('platform-hold', handleHoldEvent);
    return () => window.removeEventListener('platform-hold', handleHoldEvent);
  }, []);

  const isHeld = Boolean(subscription?.platformHold) || Boolean(eventData);

  if (!isHeld) {
    return null;
  }

  const isOwner = user?.orgRole === 'owner' || user?.role === 'admin';
  const holdMessage =
    eventData?.message ||
    'Your account has been placed on hold by the platform. Operational services and renewal payments are currently disabled.';

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full bg-stone-950 border-b border-red-700/40 text-stone-100 px-4 py-3 sm:px-6 transition-all duration-200 shadow-sm"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-danger/20 text-danger shrink-0 mt-0.5 sm:mt-0">
            <ShieldExclamationIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-small text-white">
                Account Placed on Platform Hold
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-red-950/80 text-red-300 border border-red-800/60 font-mono">
                Platform Hold
              </span>
            </div>
            <p className="text-caption text-stone-300 mt-0.5 leading-relaxed">
              {holdMessage} {isOwner ? 'Please contact platform support to resolve this hold.' : 'Please notify your organization owner to contact platform support.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <a
            href="mailto:support@zanapos.com?subject=Platform%20Hold%20Assistance%20Request"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-small transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
          >
            <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
            <span>Contact Support</span>
          </a>
        </div>
      </div>
    </div>
  );
}
