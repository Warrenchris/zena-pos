import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-yellow"></div>
  </div>
);

const RootLayout = () => {
  return (
    <div className="min-h-screen bg-app text-text-primary transition-colors duration-200">
      <Suspense fallback={<LoadingSpinner />}>
        <Outlet />
      </Suspense>
    </div>
  );
};

export default RootLayout;