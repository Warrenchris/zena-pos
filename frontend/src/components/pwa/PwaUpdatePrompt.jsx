import React, { useEffect, useSyncExternalStore } from 'react';
import Button from '../ui/Button';
import { applyPwaUpdate, dismissPwaPrompt, getPwaState, subscribePwa } from '../../pwa/registerServiceWorker';

/** Asks before applying a new version, and confirms once the app can work offline. */
export default function PwaUpdatePrompt() {
  const { needRefresh, offlineReady } = useSyncExternalStore(subscribePwa, getPwaState, getPwaState);

  // "Ready to work offline" is only worth a few seconds.
  useEffect(() => {
    if (!offlineReady || needRefresh) return undefined;
    const timer = setTimeout(dismissPwaPrompt, 6000);
    return () => clearTimeout(timer);
  }, [offlineReady, needRefresh]);

  if (needRefresh) {
    return (
      <div
        role="alert"
        className="fixed bottom-4 right-4 z-[70] max-w-sm rounded-2xl border border-border-default bg-surface p-4 shadow-xl space-y-3"
      >
        <div>
          <p className="text-small font-semibold text-text-primary">A new version of Zana POS is ready</p>
          <p className="text-caption text-text-secondary mt-0.5">
            Update when you&apos;re between sales. The page reloads, and your cart and any offline sales are kept.
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={dismissPwaPrompt}>
            Later
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={() => applyPwaUpdate()}>
            Update now
          </Button>
        </div>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div
        role="status"
        className="fixed bottom-4 right-4 z-[70] max-w-sm rounded-2xl border border-border-default bg-surface px-4 py-3 shadow-xl"
      >
        <p className="text-caption text-text-primary">
          <span className="font-semibold">Ready to work offline.</span> Zana POS is saved on this device.
        </p>
      </div>
    );
  }

  return null;
}
