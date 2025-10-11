import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-yellow"></div>
  </div>
);

const RootLayout = () => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  // For login page, render without any navigation
  if (isLoginPage) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Suspense fallback={<LoadingSpinner />}>
          <Outlet />
        </Suspense>
      </div>
    );
  }

  // For other pages, render with the Layout component (which includes sidebar and top nav)
  return (
    <div className="min-h-screen bg-gray-900">
      <Suspense fallback={<LoadingSpinner />}>
        <Outlet />
      </Suspense>
    </div>
  );
};

export default RootLayout;