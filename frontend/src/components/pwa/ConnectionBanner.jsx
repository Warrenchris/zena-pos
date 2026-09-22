import React from 'react';
import { SignalSlashIcon } from '@heroicons/react/24/outline';
import useOnlineStatus from '../../hooks/useOnlineStatus';

/** Small notice while the device has no connection. */
export default function ConnectionBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] flex items-center gap-2.5 rounded-full border border-warning/30 bg-surface px-4 py-2.5 shadow-lg"
    >
      <SignalSlashIcon className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-caption text-text-primary">
        <span className="font-semibold">You&apos;re offline.</span> Cash sales are saved on this device and sent when the
        connection returns.
      </p>
    </div>
  );
}
