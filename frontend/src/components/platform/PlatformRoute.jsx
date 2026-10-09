import React from 'react';
import { Navigate, Outlet, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export default function PlatformRoute({ children }) {
  const { token, user, loading } = useSelector((state) => state.auth);

  if (!token && !loading) {
    return <Navigate to="/login" replace />;
  }

  // If user is authenticated but not a platform super-admin
  if (user && user.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-app text-text-primary flex items-center justify-center p-6 transition-colors duration-200">
        <div className="max-w-md w-full bg-surface border border-border-default rounded-2xl p-8 shadow-floating text-center">
          <div className="w-16 h-16 bg-danger/10 text-danger rounded-2xl flex items-center justify-center mx-auto mb-4 border border-danger/20 shadow-2xs">
            <ExclamationTriangleIcon className="w-8 h-8" aria-hidden="true" />
          </div>
          <h2 className="text-h2 font-bold text-text-primary mb-2 tracking-tight">Platform Access Denied</h2>
          <p className="text-text-secondary mb-6 text-small leading-relaxed">
            This area requires platform super-admin privileges. Your current account ({user.email}) does not have operator access.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 bg-primary hover:bg-primary-hover active:bg-primary-active text-white text-small font-semibold rounded-xl transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            Return to POS Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children ? children : <Outlet />;
}
