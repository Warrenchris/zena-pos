import React from 'react';
import { Navigate, Outlet, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';

export default function PlatformRoute({ children }) {
  const { token, user, loading } = useSelector((state) => state.auth);

  if (!token && !loading) {
    return <Navigate to="/login" replace />;
  }

  // If user is authenticated but not a platform super-admin
  if (user && user.role !== 'super_admin') {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Platform Access Denied</h2>
          <p className="text-slate-400 mb-6 text-sm">
            This area requires platform super-admin privileges. Your current account ({user.email}) does not have operator access.
          </p>
          <Link
            to="/dashboard"
            className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-blue-600/30"
          >
            Return to POS Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return children ? children : <Outlet />;
}
