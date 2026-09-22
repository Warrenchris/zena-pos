import React from 'react';
import { SignalSlashIcon } from '@heroicons/react/24/outline';
import Button from './ui/Button';

/**
 * Shown instead of the login page when the app can't reach the server but the user is still signed in
 * (e.g. the shop's internet is down and this device hasn't been used offline before).
 */
export default function ConnectionProblem({ onRetry, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-app p-6">
      <div className="max-w-md w-full bg-surface border border-border-default rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <SignalSlashIcon className="h-12 w-12 mx-auto text-warning" aria-hidden="true" />
        <h1 className="text-h3 font-semibold text-text-primary">Can&apos;t reach the server</h1>
        <p className="text-small text-text-secondary">
          You are still signed in. Check your internet connection. This page will retry on its own when the connection
          comes back.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button type="button" variant="primary" onClick={onRetry}>
            Try again
          </Button>
          <Button type="button" variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
